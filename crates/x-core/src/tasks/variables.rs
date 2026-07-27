use std::path::Path;

pub fn substitute_task_variables(
    input: &str,
    workspace_root: &Path,
    active_file: Option<&Path>,
    toolchain_root: Option<&Path>,
) -> String {
    let mut result = input.to_string();

    let ws_str = workspace_root.to_string_lossy();
    result = result.replace("${workspaceRoot}", &ws_str);

    if let Some(file_path) = active_file {
        result = result.replace("${file}", &file_path.to_string_lossy());

        if let Some(file_name) = file_path.file_name() {
            result = result.replace("${fileName}", &file_name.to_string_lossy());
        }

        if let Some(file_dir) = file_path.parent() {
            result = result.replace("${fileDir}", &file_dir.to_string_lossy());
        }
    }

    if let Some(tc_root) = toolchain_root {
        result = result.replace("${toolchainRoot}", &tc_root.to_string_lossy());
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_variable_substitution() {
        let ws = Path::new("/workspace");
        let file = Path::new("/workspace/src/main.rs");
        let tc = Path::new("/toolchains/gcc");

        let input = "${workspaceRoot}/build/${fileName} in ${fileDir} via ${toolchainRoot}";
        let substituted = substitute_task_variables(input, ws, Some(file), Some(tc));

        assert!(substituted.contains("/workspace/build/main.rs"));
        assert!(substituted.contains("/workspace/src"));
        assert!(substituted.contains("/toolchains/gcc"));
    }
}
