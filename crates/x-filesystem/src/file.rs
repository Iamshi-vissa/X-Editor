use std::fs;
use std::path::Path;
use std::io;

pub fn read_file_content(path: &Path) -> io::Result<String> {
    fs::read_to_string(path)
}

pub fn write_file_content(path: &Path, content: &str) -> io::Result<()> {
    fs::write(path, content)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_read_write_file() {
        let temp_file = std::env::temp_dir().join("x_editor_file_test.txt");
        let sample_content = "X-Editor File I/O Test";

        write_file_content(&temp_file, sample_content).unwrap();
        let read = read_file_content(&temp_file).unwrap();

        assert_eq!(read, sample_content);
        let _ = fs::remove_file(&temp_file);
    }
}
