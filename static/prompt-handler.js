document.addEventListener("DOMContentLoaded", () => {
  let prompts = [];
  const promptSelect = document.getElementById("promptSelect");
  const promptDisplay = document.getElementById("prompt");
  const promptEditor = document.getElementById("promptEditor");
  const promptText = document.getElementById("promptText");
  const editPromptBtn = document.getElementById("editPromptBtn");
  const savePromptBtn = document.getElementById("savePromptBtn");
  const cancelEditBtn = document.getElementById("cancelEditBtn");
  const newPromptBtn = document.getElementById("newPromptBtn");
  const newPromptDialog = document.getElementById("newPromptDialog");
  const saveNewPromptBtn = document.getElementById("saveNewPromptBtn");
  const cancelNewPromptBtn = document.getElementById("cancelNewPromptBtn");
  const newPromptName = document.getElementById("newPromptName");
  const newPromptContent = document.getElementById("newPromptContent");

  function loadPrompts() {
    fetch("/get_prompts")
      .then((response) => response.json())
      .then((data) => {
        promptSelect.innerHTML = "";
        prompts = data.prompts;

        prompts.forEach((prompt) => {
          const option = document.createElement("option");
          option.value = prompt.name;
          option.textContent = prompt.name
            .replace(/_/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase());
          promptSelect.appendChild(option);
        });

        if (prompts.length > 0) {
          promptDisplay.textContent = prompts[0].content;
        }
      })
      .catch((error) => {
        console.error("Error fetching prompts:", error);
        promptDisplay.textContent = "Error loading prompts";
      });
  }

  promptSelect.addEventListener("change", (e) => {
    const selectedPrompt = prompts.find((p) => p.name === e.target.value);
    if (selectedPrompt) {
      promptDisplay.textContent = selectedPrompt.content;
    }
  });

  editPromptBtn.addEventListener("click", () => {
    const selectedPrompt = prompts.find((p) => p.name === promptSelect.value);
    if (selectedPrompt) {
      promptText.value = selectedPrompt.content;
      promptDisplay.style.display = "none";
      promptEditor.style.display = "block";
    }
  });

  savePromptBtn.addEventListener("click", () => {
    const promptName = promptSelect.value;
    const newContent = promptText.value;

    fetch("/update_prompt", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: promptName,
        content: newContent,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          const promptIndex = prompts.findIndex((p) => p.name === promptName);
          if (promptIndex !== -1) {
            prompts[promptIndex].content = newContent;
            promptDisplay.textContent = newContent;
          }
          promptEditor.style.display = "none";
          promptDisplay.style.display = "block";
        } else {
          alert("Failed to update prompt");
        }
      })
      .catch((error) => {
        console.error("Error updating prompt:", error);
        alert("Error updating prompt");
      });
  });

  cancelEditBtn.addEventListener("click", () => {
    promptEditor.style.display = "none";
    promptDisplay.style.display = "block";
  });

  newPromptBtn.addEventListener("click", () => {
    newPromptDialog.style.display = "block";
  });

  cancelNewPromptBtn.addEventListener("click", () => {
    newPromptDialog.style.display = "none";
    newPromptName.value = "";
    newPromptContent.value = "";
  });

  saveNewPromptBtn.addEventListener("click", async () => {
    const name = newPromptName.value.trim().toLowerCase().replace(/\s+/g, "_");
    const content = newPromptContent.value.trim();

    if (!name || !content) {
      alert("Please fill in both name and content fields");
      return;
    }

    try {
      const response = await fetch("/create_prompt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, content }),
      });

      const data = await response.json();

      if (data.success) {
        newPromptDialog.style.display = "none";
        newPromptName.value = "";
        newPromptContent.value = "";
        loadPrompts(); // Reload the prompts list
      } else {
        alert(data.error || "Failed to create prompt");
      }
    } catch (error) {
      console.error("Error creating prompt:", error);
      alert("Failed to create prompt");
    }
  });

  loadPrompts();
});
