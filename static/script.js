let isRecording = false;
let socket;
let microphone;
let currentTranscript = "";
let currentRecordingId = null;

const socket_port = 5001;
socket = io(
  "http://" + window.location.hostname + ":" + socket_port.toString()
);

socket.on("transcription_update", (data) => {
  currentTranscript += " " + data.transcription;
  // Optionally update a live display of the transcript
  const captionsElement = document.getElementById("captions");
  if (captionsElement) {
    captionsElement.innerHTML = currentTranscript;
  }
});

async function getMicrophone() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return new MediaRecorder(stream, { mimeType: "audio/webm" });
  } catch (error) {
    console.error("Error accessing microphone:", error);
    throw error;
  }
}

async function openMicrophone(microphone, socket) {
  return new Promise((resolve) => {
    microphone.onstart = () => {
      console.log("Client: Microphone opened");
      document.body.classList.add("recording");
      resolve();
    };
    microphone.ondataavailable = async (event) => {
      console.log("client: microphone data received");
      if (event.data.size > 0) {
        socket.emit("audio_stream", event.data);
      }
    };
    microphone.start(1000);
  });
}

async function startRecording() {
  isRecording = true;
  microphone = await getMicrophone();
  console.log("Client: Waiting to open microphone");
  await openMicrophone(microphone, socket);
}

async function stopRecording() {
  if (isRecording === true) {
    microphone.stop();
    microphone.stream.getTracks().forEach((track) => track.stop());
    socket.emit("toggle_transcription", { action: "stop" });

    document.getElementById("captions").innerHTML = currentTranscript;

    const promptType = document.getElementById("promptSelect").value;
    socket.emit("get_summary", {
      transcript: currentTranscript,
      promptType: promptType,
      user_id: document.body.getAttribute("data-user-id"),
    });

    microphone = null;
    isRecording = false;
    console.log("Client: Microphone closed");
    document.body.classList.remove("recording");

    currentTranscript = "";
  }
}

socket.on("summary_ready", (data) => {
  document.getElementById("summary").innerHTML = data.summary;
});

socket.on("recording_saved", (data) => {
  currentRecordingId = data.recording_id;
});

document.addEventListener("DOMContentLoaded", () => {
  const recordButton = document.getElementById("record");
  const promptSelect = document.getElementById("promptSelect");
  const regenerateBtn = document.getElementById("regenerateBtn");

  // Fetch available prompts
  fetch("/get_prompts")
    .then((response) => response.json())
    .then((data) => {
      // Populate the dropdown with prompt options
      data.prompts.forEach((prompt) => {
        const option = document.createElement("option");
        option.value = prompt.name;
        option.textContent = prompt.name
          .replace(/_/g, " ")
          .replace(/\b\w/g, (l) => l.toUpperCase());
        promptSelect.appendChild(option);
      });
    })
    .catch((error) => console.error("Error loading prompts:", error));

  regenerateBtn.addEventListener("click", () => {
    const transcript = document.getElementById("captions").innerText;
    const promptType = document.getElementById("promptSelect").value;

    if (transcript.trim() === "Realtime speech transcription API") {
      alert("Please record some audio first before generating a summary.");
      return;
    }

    socket.emit("get_summary", {
      transcript: transcript,
      promptType: promptType,
      user_id: document.body.getAttribute("data-user-id"),
    });
  });

  recordButton.addEventListener("click", () => {
    if (!isRecording) {
      socket.emit("toggle_transcription", { action: "start" });
      startRecording().catch((error) =>
        console.error("Error starting recording:", error)
      );
    } else {
      stopRecording().catch((error) =>
        console.error("Error stopping recording:", error)
      );
    }
  });

  loadUserRecordings();

  socket.on("recording_saved", (data) => {
    currentRecordingId = data.recording_id;
    loadUserRecordings();
  });
});

document.getElementById("copyNoteBtn").addEventListener("click", async () => {
  const summaryText = document.getElementById("summary").innerText;
  try {
    await navigator.clipboard.writeText(summaryText);
    // Optional: Add some visual feedback that the copy was successful
  } catch (err) {
    console.error("Failed to copy text: ", err);
  }
});

document
  .getElementById("saveTranscriptBtn")
  .addEventListener("click", async () => {
    if (!currentRecordingId) {
      alert("No recording session to save");
      return;
    }

    const transcript = document.getElementById("captions").innerText;

    try {
      const response = await fetch("/save_edits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recording_id: currentRecordingId,
          transcript: transcript,
          type: "transcript",
        }),
      });

      const data = await response.json();
      if (data.success) {
        alert("Transcript saved successfully");
      } else {
        alert("Error saving transcript");
      }
    } catch (error) {
      console.error("Error saving transcript:", error);
      alert("Error saving transcript");
    }
  });

document
  .getElementById("saveSummaryBtn")
  .addEventListener("click", async () => {
    if (!currentRecordingId) {
      alert("No recording session to save");
      return;
    }

    const summary = document.getElementById("summary").innerText;

    try {
      const response = await fetch("/save_edits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recording_id: currentRecordingId,
          summary: summary,
          type: "summary",
        }),
      });

      const data = await response.json();
      if (data.success) {
        alert("Clinical note saved successfully");
      } else {
        alert("Error saving clinical note");
      }
    } catch (error) {
      console.error("Error saving clinical note:", error);
      alert("Error saving clinical note");
    }
  });

document.getElementById("logoutBtn").addEventListener("click", () => {
  window.location.href = "/logout";
});

function loadUserRecordings() {
  fetch("/get_user_recordings")
    .then((response) => response.json())
    .then((data) => {
      console.log("Received recordings data:", data);
      if (data.success) {
        const recordingsList = document.getElementById("recordingsList");
        recordingsList.innerHTML = "";

        if (data.recordings.length === 0) {
          recordingsList.innerHTML = "<p>No recordings found</p>";
          return;
        }

        data.recordings.forEach((recording) => {
          const recordingElement = document.createElement("div");
          recordingElement.className = "recording-item";
          recordingElement.innerHTML = `
            <div class="recording-header">
              <span class="recording-timestamp">${recording.timestamp}</span>
              <span class="recording-prompt">${recording.prompt_type
                .replace(/_/g, " ")
                .replace(/\b\w/g, (l) => l.toUpperCase())}</span>
            </div>
            <div class="recording-preview">${recording.summary}</div>
          `;

          recordingElement.addEventListener("click", () => {
            document.getElementById("captions").innerHTML =
              recording.transcript;
            document.getElementById("summary").innerHTML = recording.summary;
            document.getElementById("promptSelect").value =
              recording.prompt_type;
            currentRecordingId = recording._id;
          });

          recordingsList.appendChild(recordingElement);
        });
      } else {
        console.error("Error loading recordings:", data.error);
        const recordingsList = document.getElementById("recordingsList");
        recordingsList.innerHTML = "<p>Error loading recordings</p>";
      }
    })
    .catch((error) => {
      console.error("Error loading recordings:", error);
      const recordingsList = document.getElementById("recordingsList");
      recordingsList.innerHTML = "<p>Error loading recordings</p>";
    });
}
