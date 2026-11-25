use std::collections::{BTreeMap, HashMap};

pub struct Process {
    pub pid: u32,
    pub parent: u32,
    pub exe: String,
    pub title: String,
}

pub fn roots(processes: &[Process]) -> Vec<&Process> {
    let exe_of: HashMap<u32, &str> = processes.iter().map(|p| (p.pid, p.exe.as_str())).collect();
    let mut picked: BTreeMap<&str, &Process> = BTreeMap::new();
    for process in processes {
        if exe_of.get(&process.parent) == Some(&process.exe.as_str()) {
            continue;
        }
        picked
            .entry(&process.exe)
            .and_modify(|root| {
                if root.title.is_empty() && !process.title.is_empty() {
                    *root = process;
                }
            })
            .or_insert(process);
    }
    picked.into_values().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn process(pid: u32, parent: u32, exe: &str, title: &str) -> Process {
        Process {
            pid,
            parent,
            exe: exe.into(),
            title: title.into(),
        }
    }

    fn picked(processes: &[Process]) -> Vec<(&str, u32)> {
        roots(processes)
            .iter()
            .map(|p| (p.exe.as_str(), p.pid))
            .collect()
    }

    #[test]
    fn picks_the_root_of_a_chrome_tree() {
        let processes = [
            process(4, 0, "System", ""),
            process(900, 4, "explorer.exe", "Taskbar"),
            process(1200, 900, "chrome.exe", "Design sync - Google Meet"),
            process(1210, 1200, "chrome.exe", ""),
            process(1220, 1200, "chrome.exe", ""),
            process(1230, 1210, "chrome.exe", ""),
            process(1300, 900, "Zoom.exe", "Zoom Meeting"),
        ];
        assert_eq!(
            picked(&processes),
            [
                ("System", 4),
                ("Zoom.exe", 1300),
                ("chrome.exe", 1200),
                ("explorer.exe", 900)
            ]
        );
    }

    #[test]
    fn prefers_the_root_with_a_window_when_an_exe_has_two_trees() {
        let processes = [
            process(900, 4, "explorer.exe", ""),
            process(1100, 700, "Zoom.exe", ""),
            process(1200, 900, "Zoom.exe", "Zoom Meeting"),
            process(1210, 1200, "Zoom.exe", ""),
        ];
        assert_eq!(
            picked(&processes),
            [("Zoom.exe", 1200), ("explorer.exe", 900)]
        );
    }
}
