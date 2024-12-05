import { App, Modal, Plugin, WorkspaceLeaf, View } from "obsidian";


// Obsidian Guidelines, 
// Don't use var. Use let or const instead.
// Do use async and await when you can for readability, instead of using Promise.
// Don't manage reading and write plugin data yourself. Use Plugin.loadData() and Plugin.saveData() instead.

type Task = {
  id: string;
  text: string;
  dueDate: string;
  tags: string[];
  status: "not started" | "in progress" | "completed";
  // add priority later? low, medium, high
  // boolean for recurring?
  // add notes?
};

const VIEW_TYPE_TASK_MANAGER = "procrastinot-view";

// ALL input fields in this plugin 
class InputModal extends Modal {
  placeholder: string;
  callback: (input: string) => void;

  constructor(app: App, placeholder: string, callback: (input: string) => void) {
    super(app);
    this.placeholder = placeholder;
    this.callback = callback;
  }

  // filter buttons
  onOpen() {
    const { contentEl } = this;

    contentEl.createEl("h2", { text: "Enter Filter Criteria" });

    const inputEl = contentEl.createEl("input", {
      attr: { type: "text", placeholder: this.placeholder },
    });

    const submitButton = contentEl.createEl("button", { text: "Submit" });
    submitButton.onclick = () => {
      this.callback(inputEl.value);
      this.close();
    };

    inputEl.focus();
  }

  // needed to clear content after filter is applied, 
  onClose() {
    this.contentEl.empty();
  }
}

// Custom views need to be registered when the plugin is enabled, and cleaned up when the plugin is disabled
export default class ProcrastinotPlugin extends Plugin {
  tasks: Task[] = [];

  async onload() {
    // important: loadDat() and saveData() serializes
    this.tasks = (await this.loadData()) || [];

    this.registerView(
      VIEW_TYPE_TASK_MANAGER,
      (leaf) => new TaskManagerView(leaf, this)
    );

    this.addRibbonIcon("check-in-circle", "Procrastinot", () => {
      this.activateView();
    });

    // for CTRL+P command palette search
    this.addCommand({
      id: "open-procrastinot",
      name: "Open Procrastinot",
      callback: () => this.activateView(),
    });
  }

  // obsidian sample code edited
  // saving data before closing the plugin.
  async onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_TASK_MANAGER);
    await this.saveData(this.tasks);
  }

  async saveTasks() {
    await this.saveData(this.tasks);
  }

  // obsidian sample code edited
  async activateView() {
    const { workspace } = this.app;

    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_TASK_MANAGER);

    if (leaves.length > 0) {
        // A leaf with the Procrastinot view already exists, use that
        leaf = leaves[0];
    } else {
        // The Procrastinot view could not be found, create a new leaf in the right sidebar
        leaf = workspace.getRightLeaf(false);
        // needed to add a null check
        if (leaf) {
            await leaf.setViewState({ type: VIEW_TYPE_TASK_MANAGER, active: true });
        }
    }
    // Reveal the leaf in case it is in a collapsed sidebar
    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }
}

// UI for the plugin
class TaskManagerView extends View {
  plugin: ProcrastinotPlugin;

  // constructs a new instance of the ItemView class
  constructor(leaf: WorkspaceLeaf, plugin: ProcrastinotPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return VIEW_TYPE_TASK_MANAGER;
  }

  getDisplayText() {
    return "Procrastinot";
  }

  async onOpen() {
    // clears the container element
    this.containerEl.empty();

    //defining the container elements
    const containerDiv = this.containerEl.createDiv("task-manager-container");
    const filterRow = containerDiv.createDiv("filter-row");
    const addTaskRow = containerDiv.createDiv("add-task-row");
    const taskListContainer = containerDiv.createDiv("task-list-container");

    //storing instances of each filter
    let activeFilters: { 
      status?: string; 
      tags?: string[]; 
      dueDate?: string 
    } = {};

    // top row filter buttons
    const calendarButton = filterRow.createEl("button", { text: "Filter by Date" });
    calendarButton.onclick = () => {
      new InputModal(this.app, "Enter due date ", (date) => {
        activeFilters.dueDate = date;
        this.renderTasks(taskListContainer, activeFilters);
      }).open();
    };
    const statusButton = filterRow.createEl("button", { text: "Filter by Status" });
    statusButton.onclick = () => {
      new InputModal(this.app, "Enter status", (status) => {
        if (status) {
          activeFilters.status = status.toLowerCase();
          this.renderTasks(taskListContainer, activeFilters);
        }
      }).open();
    };
    const tagButton = filterRow.createEl("button", { text: "Filter by Tags" });
    tagButton.onclick = () => {
      new InputModal(this.app, "Enter tags (comma-separated)", (tags) => {
        if (tags) {
          activeFilters.tags = tags.split(",").map((tag) => tag.trim().toLowerCase());
          this.renderTasks(taskListContainer, activeFilters);
        }
      }).open();
    };
    const resetFilterButton = filterRow.createEl("button", { text: "Reset Filters" });
    resetFilterButton.onclick = () => {
      activeFilters = {};
      this.renderTasks(taskListContainer);
    };

    // middle row add task form buttons
    const taskInput = addTaskRow.createEl("input", { placeholder: "Enter task" });
    const dueDateInput = addTaskRow.createEl("input", { type: "date" });
    const tagsInput = addTaskRow.createEl("input", { placeholder: "Add tags" });
    const addTaskButton = addTaskRow.createEl("button", { text: "Add Task" });

    addTaskButton.onclick = async () => {
      if (!taskInput.value.trim() || !dueDateInput.value.trim()) {
        alert("Task and due date are required.");
        return;
      }

      const newTask: Task = {
        id: Date.now().toString(),
        text: taskInput.value.trim(),
        dueDate: dueDateInput.value.trim(),
        tags: tagsInput.value.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean),
        status: "not started",
      };

      this.plugin.tasks.push(newTask);
      this.renderTasks(taskListContainer);
      await this.plugin.saveTasks();

      taskInput.value = "";
      dueDateInput.value = "";
      tagsInput.value = "";
    };

    this.renderTasks(taskListContainer);
  }

  // filters tasks based on status, tags, and due date
  renderTasks(taskListContainer: HTMLElement, filters?: { status?: string; tags?: string[]; dueDate?: string }) {
    taskListContainer.empty();

    let tasksToRender = this.plugin.tasks;

    if (filters) {
      tasksToRender = tasksToRender.filter((task) => {
        if (filters.status && task.status !== filters.status) return false;
        if (filters.tags && !filters.tags.every((tag) => task.tags.includes(tag))) return false;
        if (filters.dueDate && task.dueDate !== filters.dueDate) return false;
        return true;
      });
    }

    // separater for tasks into completed and non-completed
    const nonCompletedTasks = tasksToRender.filter((task) => task.status !== "completed");
    const completedTasks = tasksToRender.filter((task) => task.status == "completed");

    const renderTask = (task: Task, isCompleted: boolean = false) => {
      const taskItem = taskListContainer.createEl("div", {
        cls: `task-item${isCompleted ? " completed" : ""}`,
      });

      // TASK | DUE DATE | COUNTDOWN
      taskItem.createSpan({ text: task.text });
      taskItem.createSpan({ text: `Due: ${task.dueDate}` });
      const countdownEl = taskItem.createSpan("countdown");
      //w3 
      const updateCountdown = () => {
        const current = new Date();
        const dueDate = new Date(task.dueDate);
        // update to ask for time as well later perhaps
        dueDate.setHours(23, 59, 59, 999);
        const timeDiff = dueDate.getTime() - current.getTime();
        if (timeDiff <= 0) {
          countdownEl.textContent = "Expired";
          countdownEl.classList.add("expired");
          return;
        }
        const totalMinutes = Math.floor(timeDiff / (1000 * 60));
        const days = Math.floor(totalMinutes / (60 * 24));
        const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
        const minutes = totalMinutes % 60;
        countdownEl.textContent = `${days}d ${hours}h ${minutes}m`;
      };
      //refresh rate, allow user to change later perhaps
      updateCountdown();
      const intervalId = setInterval(updateCountdown, 60000);
      const cleanup = () => clearInterval(intervalId);
      
      // drop dowm element
      const statusDropdown = taskItem.createEl("select");
      ["not started", "in progress", "completed"].forEach((status) => {
        const option = statusDropdown.createEl("option", { text: status });
        option.value = status;
        // current status
        if (task.status == status) option.selected = true;
      });
      //action for changing status
      statusDropdown.onchange = async (e: Event) => {
        task.status = (e.target as HTMLSelectElement).value as Task["status"];
        if (task.status === "completed") cleanup();
        await this.plugin.saveTasks();
        this.renderTasks(taskListContainer, filters);
      };
      //rightclick HTML event (delete for now, add edit later)
      taskItem.oncontextmenu = async (e: MouseEvent) => {
        e.preventDefault(); //confirmation
        if (confirm(`Delete this task?\n"${task.text}"`)) {
          this.plugin.tasks = this.plugin.tasks.filter((t) => t.id !== task.id);
          cleanup();
          await this.plugin.saveTasks();
          this.renderTasks(taskListContainer, filters);
        }
      };
    };

    nonCompletedTasks.forEach((task) => renderTask(task));
    if (completedTasks.length > 0) {
      taskListContainer.createEl("h3", { text: "Completed Tasks" });
      taskListContainer.createEl("hr");
      completedTasks.forEach((task) => renderTask(task, true));
    }
  }
}