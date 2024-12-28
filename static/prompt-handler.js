document.addEventListener("DOMContentLoaded", () => {
  // Fetch all prompts and populate dropdown
  fetch("/get_prompts")
    .then((response) => response.json())
    .then((data) => {
      const promptSelect = document.getElementById("promptSelect");
      const promptDisplay = document.getElementById("prompt");

      // Clear existing options
      promptSelect.innerHTML = "";

      // Store prompts for later use
      const prompts = data.prompts;

      // Add options to dropdown
      prompts.forEach((prompt) => {
        const option = document.createElement("option");
        option.value = prompt.name;
        option.textContent = prompt.name
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
        promptSelect.appendChild(option);
      });

      // Display initial prompt content
      if (prompts.length > 0) {
        promptDisplay.textContent = prompts[0].content;
      }

      // Add change event listener
      promptSelect.addEventListener("change", (e) => {
        const selectedPrompt = prompts.find((p) => p.name === e.target.value);
        if (selectedPrompt) {
          promptDisplay.textContent = selectedPrompt.content;
        }
      });
    })
    .catch((error) => {
      console.error("Error fetching prompts:", error);
      document.getElementById("prompt").textContent = "Error loading prompts";
    });
});
