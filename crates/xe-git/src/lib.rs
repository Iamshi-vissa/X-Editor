//! Git through libgit2: status, staging, commits, branches, gutter diffs, and
//! clone / fetch / push authenticated with the signed-in GitHub token.

use git2::{
    build::RepoBuilder, BranchType, Cred, FetchOptions, IndexAddOption, PushOptions, RemoteCallbacks, Repository,
    Signature, Status, StatusOptions,
};
use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, thiserror::Error)]
pub enum GitError {
    #[error("{}", .0.message())]
    Git(#[from] git2::Error),
    #[error("{0}")]
    Other(String),
}

impl serde::Serialize for GitError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, GitError>;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileStatus {
    pub path: String,
    /// One of: added, modified, deleted, renamed, typechange, untracked, conflicted
    pub status: String,
    pub staged: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoStatus {
    pub is_repo: bool,
    pub branch: Option<String>,
    pub upstream: Option<String>,
    pub ahead: usize,
    pub behind: usize,
    pub files: Vec<FileStatus>,
}

fn open(root: &Path) -> Result<Repository> {
    Ok(Repository::discover(root)?)
}

fn workdir(repo: &Repository) -> Result<PathBuf> {
    repo.workdir().map(|p| p.to_path_buf()).ok_or_else(|| GitError::Other("bare repositories aren't supported".into()))
}

fn rel_path(repo: &Repository, path: &Path) -> Result<String> {
    let wd = workdir(repo)?;
    let wd = wd.canonicalize().unwrap_or(wd);
    let abs = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    let rel = abs.strip_prefix(&wd).map_err(|_| GitError::Other("file is not inside the repository".into()))?;
    Ok(rel.to_string_lossy().replace('\\', "/"))
}

pub fn status(root: &Path) -> Result<RepoStatus> {
    let repo = match open(root) {
        Ok(r) => r,
        Err(_) => {
            return Ok(RepoStatus { is_repo: false, branch: None, upstream: None, ahead: 0, behind: 0, files: vec![] })
        }
    };
    let mut opts = StatusOptions::new();
    opts.include_untracked(true).recurse_untracked_dirs(true).renames_head_to_index(true);
    let statuses = repo.statuses(Some(&mut opts))?;
    let mut files = Vec::new();
    for entry in statuses.iter() {
        let s = entry.status();
        let Some(path) = entry.path() else { continue };
        if s.is_conflicted() {
            files.push(FileStatus { path: path.into(), status: "conflicted".into(), staged: false });
            continue;
        }
        let index = [
            (Status::INDEX_NEW, "added"),
            (Status::INDEX_MODIFIED, "modified"),
            (Status::INDEX_DELETED, "deleted"),
            (Status::INDEX_RENAMED, "renamed"),
            (Status::INDEX_TYPECHANGE, "typechange"),
        ];
        for (flag, name) in index {
            if s.contains(flag) {
                files.push(FileStatus { path: path.into(), status: name.into(), staged: true });
                break;
            }
        }
        let wt = [
            (Status::WT_NEW, "untracked"),
            (Status::WT_MODIFIED, "modified"),
            (Status::WT_DELETED, "deleted"),
            (Status::WT_RENAMED, "renamed"),
            (Status::WT_TYPECHANGE, "typechange"),
        ];
        for (flag, name) in wt {
            if s.contains(flag) {
                files.push(FileStatus { path: path.into(), status: name.into(), staged: false });
                break;
            }
        }
    }

    let (mut branch, mut upstream, mut ahead, mut behind) = (None, None, 0, 0);
    match repo.head() {
        Ok(head) => {
            branch = head.shorthand().map(String::from);
            if head.is_branch() {
                if let Some(name) = head.shorthand() {
                    if let Ok(local) = repo.find_branch(name, BranchType::Local) {
                        if let Ok(up) = local.upstream() {
                            upstream = up.name().ok().flatten().map(String::from);
                            if let (Some(l), Some(u)) = (local.get().target(), up.get().target()) {
                                if let Ok((a, b)) = repo.graph_ahead_behind(l, u) {
                                    ahead = a;
                                    behind = b;
                                }
                            }
                        }
                    }
                }
            } else if let Some(oid) = head.target() {
                branch = Some(format!("{:.7}", oid));
            }
        }
        Err(_) => {
            // Unborn branch (fresh `git init`): read the name HEAD points at.
            if let Ok(r) = repo.find_reference("HEAD") {
                branch = r.symbolic_target().map(|t| t.trim_start_matches("refs/heads/").to_string());
            }
        }
    }
    Ok(RepoStatus { is_repo: true, branch, upstream, ahead, behind, files })
}

pub fn init(root: &Path) -> Result<()> {
    Repository::init(root)?;
    Ok(())
}

pub fn stage(root: &Path, paths: &[String]) -> Result<()> {
    let repo = open(root)?;
    let wd = workdir(&repo)?;
    let mut index = repo.index()?;
    for p in paths {
        if wd.join(p).exists() {
            index.add_path(Path::new(p))?;
        } else {
            index.remove_path(Path::new(p))?;
        }
    }
    index.write()?;
    Ok(())
}

pub fn stage_all(root: &Path) -> Result<()> {
    let repo = open(root)?;
    let mut index = repo.index()?;
    index.add_all(["*"].iter(), IndexAddOption::DEFAULT, None)?;
    index.update_all(["*"].iter(), None)?;
    index.write()?;
    Ok(())
}

pub fn unstage(root: &Path, paths: &[String]) -> Result<()> {
    let repo = open(root)?;
    match repo.head().ok().and_then(|h| h.peel_to_commit().ok()) {
        Some(commit) => repo.reset_default(Some(commit.as_object()), paths.iter())?,
        None => {
            let mut index = repo.index()?;
            for p in paths {
                index.remove_path(Path::new(p))?;
            }
            index.write()?;
        }
    }
    Ok(())
}

/// Throws away working-tree changes to the given files (restores them from the index/HEAD).
/// Untracked files are moved to the trash by the caller, not here.
pub fn discard(root: &Path, paths: &[String]) -> Result<()> {
    let repo = open(root)?;
    let mut cb = git2::build::CheckoutBuilder::new();
    cb.force();
    for p in paths {
        cb.path(p);
    }
    repo.checkout_index(None, Some(&mut cb))?;
    Ok(())
}

pub fn commit(root: &Path, message: &str, fallback_name: Option<&str>, fallback_email: Option<&str>) -> Result<String> {
    if message.trim().is_empty() {
        return Err(GitError::Other("commit message is empty".into()));
    }
    let repo = open(root)?;
    let sig = match repo.signature() {
        Ok(s) => s,
        Err(_) => match (fallback_name, fallback_email) {
            (Some(n), Some(e)) => Signature::now(n, e)?,
            _ => {
                return Err(GitError::Other(
                    "Git doesn't know who you are. Sign in with GitHub or set user.name and user.email.".into(),
                ))
            }
        },
    };
    let mut index = repo.index()?;
    let tree_id = index.write_tree()?;
    let tree = repo.find_tree(tree_id)?;
    let parents: Vec<git2::Commit> = repo.head().ok().and_then(|h| h.peel_to_commit().ok()).into_iter().collect();
    if let Some(parent) = parents.first() {
        if parent.tree_id() == tree_id {
            return Err(GitError::Other("nothing staged to commit".into()));
        }
    }
    let parent_refs: Vec<&git2::Commit> = parents.iter().collect();
    let oid = repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &parent_refs)?;
    Ok(oid.to_string())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchInfo {
    pub name: String,
    pub is_head: bool,
    pub is_remote: bool,
}

pub fn branches(root: &Path) -> Result<Vec<BranchInfo>> {
    let repo = open(root)?;
    let mut out = Vec::new();
    for b in repo.branches(None)? {
        let (b, kind) = b?;
        if let Some(name) = b.name()? {
            if name.ends_with("/HEAD") {
                continue;
            }
            out.push(BranchInfo { name: name.into(), is_head: b.is_head(), is_remote: kind == BranchType::Remote });
        }
    }
    out.sort_by(|a, b| a.is_remote.cmp(&b.is_remote).then(a.name.cmp(&b.name)));
    Ok(out)
}

/// Switches branch. A remote branch like `origin/feature` creates a local tracking branch.
pub fn checkout(root: &Path, name: &str, create: bool) -> Result<()> {
    let repo = open(root)?;
    let local_name = if create {
        let head = repo.head()?.peel_to_commit()?;
        repo.branch(name, &head, false)?;
        name.to_string()
    } else if repo.find_branch(name, BranchType::Local).is_ok() {
        name.to_string()
    } else if let Ok(remote) = repo.find_branch(name, BranchType::Remote) {
        let local = name.split_once('/').map(|(_, n)| n.to_string()).unwrap_or_else(|| name.to_string());
        let commit = remote.get().peel_to_commit()?;
        let mut b = repo.branch(&local, &commit, false)?;
        b.set_upstream(Some(name))?;
        local
    } else {
        return Err(GitError::Other(format!("branch {name} not found")));
    };
    let refname = format!("refs/heads/{local_name}");
    let obj = repo.revparse_single(&refname)?;
    repo.checkout_tree(&obj, Some(git2::build::CheckoutBuilder::new().safe()))?;
    repo.set_head(&refname)?;
    Ok(())
}

/// Returns the file's content at HEAD, or None if it's new / not in a repository.
pub fn head_text(root: &Path, file: &Path) -> Result<Option<String>> {
    let Ok(repo) = open(root) else { return Ok(None) };
    let rel = rel_path(&repo, file)?;
    let Ok(head) = repo.head() else { return Ok(None) };
    let tree = head.peel_to_tree()?;
    let Ok(entry) = tree.get_path(Path::new(&rel)) else { return Ok(None) };
    let blob = repo.find_blob(entry.id())?;
    if blob.is_binary() {
        return Ok(None);
    }
    Ok(Some(String::from_utf8_lossy(blob.content()).into_owned()))
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LineChange {
    /// added, modified or deleted
    pub kind: String,
    /// 1-based first line in the current text
    pub from: usize,
    /// 1-based last line (inclusive); for deletions equal to `from`
    pub to: usize,
}

/// Line-level changes between `base` and `current`, for the editor's change gutter.
pub fn line_changes(base: &str, current: &str) -> Vec<LineChange> {
    use similar::{DiffOp, TextDiff};
    let diff = TextDiff::from_lines(base, current);
    let mut out = Vec::new();
    for op in diff.ops() {
        match *op {
            DiffOp::Insert { new_index, new_len, .. } => {
                out.push(LineChange { kind: "added".into(), from: new_index + 1, to: new_index + new_len })
            }
            DiffOp::Replace { new_index, new_len, .. } => {
                out.push(LineChange { kind: "modified".into(), from: new_index + 1, to: new_index + new_len })
            }
            DiffOp::Delete { new_index, .. } => {
                let line = new_index.max(1);
                out.push(LineChange { kind: "deleted".into(), from: line, to: line })
            }
            DiffOp::Equal { .. } => {}
        }
    }
    out
}

fn callbacks<'a>(token: Option<&'a str>, progress: Option<&'a dyn Fn(usize, usize)>) -> RemoteCallbacks<'a> {
    let mut cb = RemoteCallbacks::new();
    cb.credentials(move |_url, username, allowed| {
        if let Some(t) = token {
            if allowed.contains(git2::CredentialType::USER_PASS_PLAINTEXT) {
                return Cred::userpass_plaintext("x-access-token", t);
            }
        }
        if allowed.contains(git2::CredentialType::SSH_KEY) {
            return Cred::ssh_key_from_agent(username.unwrap_or("git"));
        }
        Cred::default()
    });
    if let Some(p) = progress {
        cb.transfer_progress(move |s| {
            p(s.received_objects(), s.total_objects());
            true
        });
    }
    cb
}

pub fn clone(url: &str, dest: &Path, token: Option<&str>, progress: &dyn Fn(usize, usize)) -> Result<()> {
    let mut fo = FetchOptions::new();
    fo.remote_callbacks(callbacks(token, Some(progress)));
    RepoBuilder::new().fetch_options(fo).clone(url, dest)?;
    Ok(())
}

pub fn fetch(root: &Path, token: Option<&str>) -> Result<()> {
    let repo = open(root)?;
    let remote_name = default_remote(&repo)?;
    let mut remote = repo.find_remote(&remote_name)?;
    let mut fo = FetchOptions::new();
    fo.remote_callbacks(callbacks(token, None));
    remote.fetch::<&str>(&[], Some(&mut fo), None)?;
    Ok(())
}

fn default_remote(repo: &Repository) -> Result<String> {
    let remotes = repo.remotes()?;
    if remotes.iter().flatten().any(|r| r == "origin") {
        return Ok("origin".into());
    }
    remotes.iter().flatten().next().map(String::from).ok_or_else(|| GitError::Other("this repository has no remote".into()))
}

/// Fetches and fast-forwards the current branch. Refuses to merge diverged history, so
/// nothing is ever changed behind the user's back.
pub fn pull(root: &Path, token: Option<&str>) -> Result<String> {
    fetch(root, token)?;
    let repo = open(root)?;
    let head = repo.head()?;
    let name = head.shorthand().ok_or_else(|| GitError::Other("not on a branch".into()))?.to_string();
    let local = repo.find_branch(&name, BranchType::Local)?;
    let upstream = local.upstream().map_err(|_| GitError::Other(format!("{name} has no upstream branch")))?;
    let target = upstream.get().target().ok_or_else(|| GitError::Other("upstream has no commits".into()))?;
    let annotated = repo.find_annotated_commit(target)?;
    let (analysis, _) = repo.merge_analysis(&[&annotated])?;
    if analysis.is_up_to_date() {
        return Ok("Already up to date".into());
    }
    if analysis.is_fast_forward() {
        let refname = format!("refs/heads/{name}");
        let mut r = repo.find_reference(&refname)?;
        r.set_target(target, "fast-forward pull")?;
        repo.set_head(&refname)?;
        repo.checkout_head(Some(git2::build::CheckoutBuilder::new().safe()))?;
        return Ok("Fast-forwarded".into());
    }
    Err(GitError::Other("Your branch and the remote have diverged. Merge or rebase in the terminal.".into()))
}

pub fn push(root: &Path, token: Option<&str>) -> Result<()> {
    let repo = open(root)?;
    let head = repo.head()?;
    let name = head.shorthand().ok_or_else(|| GitError::Other("not on a branch".into()))?.to_string();
    let remote_name = default_remote(&repo)?;
    let mut remote = repo.find_remote(&remote_name)?;
    let rejected = std::cell::RefCell::new(None::<String>);
    let mut po = PushOptions::new();
    let mut cb = callbacks(token, None);
    cb.push_update_reference(|refname, status| {
        if let Some(msg) = status {
            *rejected.borrow_mut() = Some(format!("{refname}: {msg}"));
        }
        Ok(())
    });
    po.remote_callbacks(cb);
    let spec = format!("refs/heads/{name}:refs/heads/{name}");
    remote.push(&[&spec], Some(&mut po))?;
    drop(po);
    if let Some(msg) = rejected.into_inner() {
        return Err(GitError::Other(format!("push rejected ({msg}). Pull first.")));
    }
    let mut local = repo.find_branch(&name, BranchType::Local)?;
    if local.upstream().is_err() {
        let _ = local.set_upstream(Some(&format!("{remote_name}/{name}")));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn repo_with_commit() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_path_buf();
        init(&root).unwrap();
        std::fs::write(root.join("a.txt"), "one\ntwo\nthree\n").unwrap();
        stage(&root, &["a.txt".into()]).unwrap();
        commit(&root, "first", Some("Test"), Some("t@example.com")).unwrap();
        (dir, root)
    }

    #[test]
    fn status_stage_commit_flow() {
        let (_d, root) = repo_with_commit();
        std::fs::write(root.join("a.txt"), "one\n2\nthree\n").unwrap();
        std::fs::write(root.join("b.txt"), "new").unwrap();
        let s = status(&root).unwrap();
        assert!(s.is_repo);
        assert!(s.files.iter().any(|f| f.path == "a.txt" && f.status == "modified" && !f.staged));
        assert!(s.files.iter().any(|f| f.path == "b.txt" && f.status == "untracked"));
        stage_all(&root).unwrap();
        let s = status(&root).unwrap();
        assert!(s.files.iter().all(|f| f.staged));
        unstage(&root, &["b.txt".into()]).unwrap();
        assert!(status(&root).unwrap().files.iter().any(|f| f.path == "b.txt" && !f.staged));
        commit(&root, "second", Some("Test"), Some("t@example.com")).unwrap();
        assert_eq!(head_text(&root, &root.join("a.txt")).unwrap().as_deref(), Some("one\n2\nthree\n"));
    }

    #[test]
    fn gutter_changes() {
        let c = line_changes("a\nb\nc\n", "a\nB\nc\nd\n");
        assert_eq!(c[0], LineChange { kind: "modified".into(), from: 2, to: 2 });
        assert_eq!(c[1], LineChange { kind: "added".into(), from: 4, to: 4 });
    }
}
