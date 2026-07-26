use std::collections::{HashMap, HashSet};
use crate::tasks::model::Task;
use crate::errors::XCoreError;

pub fn resolve_task_dependencies(
    target_id: &str,
    all_tasks: &[Task],
) -> Result<Vec<Task>, XCoreError> {
    let task_map: HashMap<&str, &Task> = all_tasks.iter().map(|t| (t.id.as_str(), t)).collect();

    if !task_map.contains_key(target_id) {
        return Err(XCoreError::TaskNotFound(target_id.to_string()));
    }

    let mut visited = HashSet::new();
    let mut visiting = HashSet::new();
    let mut order = Vec::new();
    let mut path = Vec::new();

    fn dfs<'a>(
        id: &'a str,
        task_map: &HashMap<&'a str, &'a Task>,
        visited: &mut HashSet<&'a str>,
        visiting: &mut HashSet<&'a str>,
        path: &mut Vec<&'a str>,
        order: &mut Vec<&'a Task>,
    ) -> Result<(), XCoreError> {
        if visiting.contains(id) {
            path.push(id);
            return Err(XCoreError::CircularTaskDependency(path.join(" -> ")));
        }

        if !visited.contains(id) {
            visiting.insert(id);
            path.push(id);

            let task = task_map.get(id).ok_or_else(|| XCoreError::TaskNotFound(id.to_string()))?;
            for dep_id in &task.depends_on {
                dfs(dep_id.as_str(), task_map, visited, visiting, path, order)?;
            }

            visiting.remove(id);
            visited.insert(id);
            path.pop();
            order.push(task);
        }

        Ok(())
    }

    dfs(target_id, &task_map, &mut visited, &mut visiting, &mut path, &mut order)?;

    Ok(order.into_iter().cloned().collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tasks::model::TaskType;

    fn make_task(id: &str, depends: Vec<&str>) -> Task {
        Task {
            id: id.to_string(),
            name: id.to_string(),
            task_type: TaskType::Custom,
            command: "echo".to_string(),
            args: vec![],
            working_directory: None,
            environment: Default::default(),
            depends_on: depends.into_iter().map(String::from).collect(),
            problem_matcher: None,
            group: None,
        }
    }

    #[test]
    fn test_valid_dependency_resolution() {
        let tasks = vec![
            make_task("clean", vec![]),
            make_task("build", vec!["clean"]),
            make_task("run", vec!["build"]),
        ];

        let resolved = resolve_task_dependencies("run", &tasks).unwrap();
        assert_eq!(resolved.len(), 3);
        assert_eq!(resolved[0].id, "clean");
        assert_eq!(resolved[1].id, "build");
        assert_eq!(resolved[2].id, "run");
    }

    #[test]
    fn test_circular_dependency_detection() {
        let tasks = vec![
            make_task("A", vec!["B"]),
            make_task("B", vec!["C"]),
            make_task("C", vec!["A"]),
        ];

        let res = resolve_task_dependencies("A", &tasks);
        assert!(res.is_err());
        match res.unwrap_err() {
            XCoreError::CircularTaskDependency(path) => {
                assert!(path.contains("A"));
            }
            _ => panic!("Expected CircularTaskDependency error"),
        }
    }
}
