let isRecording = false;
let socket;
let microphone;
let currentTranscript = "";
let currentRecordingId = null;

const socketUrl =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? `http://${window.location.hostname}:5001`
    : "https://bungja-socketio.onrender.com";

socket = io(socketUrl);

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

    // Check supported MIME types
    const mimeTypes = [
      "audio/webm;codecs=opus", // Best for Chrome, Edge
      "audio/webm", // Good fallback for Chrome, Edge
      "audio/mp4;codecs=mp4a", // Best for Safari
      "audio/mp4", // Good fallback for Safari
      "audio/aac", // Safari fallback
      "audio/x-m4a", // Safari alternative
      "audio/mpeg", // Wide support
      "", // Browser default (last resort)
    ];

    let selectedMimeType = null;
    for (const type of mimeTypes) {
      if (!type || MediaRecorder.isTypeSupported(type)) {
        selectedMimeType = type;
        break;
      }
    }

    const options = selectedMimeType ? { mimeType: selectedMimeType } : {};
    return new MediaRecorder(stream, options);
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
  updateRecordButtonText(true);
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
      patient_id: document.getElementById("patientSelect").value,
    });

    microphone = null;
    isRecording = false;
    updateRecordButtonText(false);
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
  updateRecordButtonText(false);
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
      patient_id: document.getElementById("patientSelect").value,
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

  // Add patient select change handler
  document.getElementById("patientSelect").addEventListener("change", () => {
    const selectedPatientId = document.getElementById("patientSelect").value;
    if (selectedPatientId) {
      toggleRecordingElements(true);
      loadUserRecordings();
    } else {
      toggleRecordingElements(false);
      showPatientPrompt();
    }
  });

  const selectedPatientId = document.getElementById("patientSelect").value;
  toggleRecordingElements(selectedPatientId ? true : false);
  if (!selectedPatientId) {
    showPatientPrompt();
  }
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
  const selectedPatientId = document.getElementById("patientSelect").value;
  const url = selectedPatientId
    ? `/get_user_recordings?patient_id=${selectedPatientId}`
    : "/get_user_recordings";

  fetch(url)
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

function toggleRecordingElements(show) {
  const elementsToHide = [
    document.querySelector(".recording-section"),
    document.querySelector(".summary-container"),
    document.querySelector(".recordings-container"),
  ];

  elementsToHide.forEach((element) => {
    if (element) {
      element.style.display = show ? "block" : "none";
    }
  });
}

function showPatientPrompt() {
  const recordingsList = document.getElementById("recordingsList");
  recordingsList.innerHTML =
    "<div class='patient-prompt'><p>Please select a patient or create a new patient to start recording</p></div>";
}

function updateRecordButtonText(isRecording) {
  const buttonText = document.querySelector(".mic-button .button-text");
  if (buttonText) {
    buttonText.textContent = isRecording ? "Stop Recording" : "Start Recording";
  }
}
