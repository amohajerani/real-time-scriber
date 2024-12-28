document.addEventListener("DOMContentLoaded", () => {
  const newPatientBtn = document.getElementById("newPatientBtn");
  const newPatientDialog = document.getElementById("newPatientDialog");
  const savePatientBtn = document.getElementById("savePatientBtn");
  const cancelPatientBtn = document.getElementById("cancelPatientBtn");
  const patientFirstName = document.getElementById("patientFirstName");
  const patientLastName = document.getElementById("patientLastName");
  const patientNotes = document.getElementById("patientNotes");
  const patientSelect = document.getElementById("patientSelect");

  function loadPatients() {
    fetch("/get_patients")
      .then((response) => response.json())
      .then((data) => {
        console.log("Received patients:", data);
        patientSelect.innerHTML = '<option value="">Select Patient</option>';
        if (data.success && data.patients) {
          data.patients.forEach((patient) => {
            const option = document.createElement("option");
            option.value = patient._id;
            option.textContent = `${patient.firstName} ${patient.lastName}`;
            patientSelect.appendChild(option);
          });
        }
      })
      .catch((error) => console.error("Error loading patients:", error));
  }

  newPatientBtn.addEventListener("click", () => {
    newPatientDialog.style.display = "block";
  });

  cancelPatientBtn.addEventListener("click", () => {
    newPatientDialog.style.display = "none";
    patientFirstName.value = "";
    patientLastName.value = "";
    patientNotes.value = "";
  });

  savePatientBtn.addEventListener("click", async () => {
    const firstName = patientFirstName.value.trim();
    const lastName = patientLastName.value.trim();
    const notes = patientNotes.value.trim();

    if (!firstName || !lastName) {
      alert("Please fill in both first and last name");
      return;
    }

    try {
      const response = await fetch("/add_patient", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          firstName,
          lastName,
          notes,
        }),
      });

      const data = await response.json();

      if (data.success) {
        newPatientDialog.style.display = "none";
        patientFirstName.value = "";
        patientLastName.value = "";
        patientNotes.value = "";
        loadPatients(); // Reload the patient list
        // Set the newly created patient as selected
        setTimeout(() => {
          patientSelect.value = data.patient._id;
          // Trigger change event to update UI
          const event = new Event("change");
          patientSelect.dispatchEvent(event);
        }, 100);
      } else {
        alert(data.error || "Failed to add patient");
      }
    } catch (error) {
      console.error("Error adding patient:", error);
      alert("Failed to add patient");
    }
  });

  // Load patients when the page loads
  loadPatients();
});
