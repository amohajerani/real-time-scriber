let isRecording = false;
let socket;
let microphone;

const socket_port = 5001;
socket = io(
  "http://" + window.location.hostname + ":" + socket_port.toString()
);

socket.on("transcription_update", (data) => {
  document.getElementById("captions").innerHTML = data.transcription;
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

    const transcript = document.getElementById("captions").innerText;
    const promptType = document.getElementById("promptSelect").value;
    socket.emit("get_summary", {
      transcript: transcript,
      promptType: promptType,
    });

    microphone = null;
    isRecording = false;
    console.log("Client: Microphone closed");
    document.body.classList.remove("recording");
  }
}

socket.on("summary_ready", (data) => {
  document.getElementById("summary").innerHTML = data.summary;
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
