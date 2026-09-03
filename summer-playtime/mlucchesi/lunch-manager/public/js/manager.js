document.querySelectorAll(".generate-message").forEach(function (btn) {
  btn.addEventListener("click", async function () {
    var section = btn.closest(".venue-group");
    var output = section.querySelector(".message-output");
    var copyBtn = section.querySelector(".copy-message");
    var sourceLabel = section.querySelector(".message-source");

    btn.disabled = true;
    btn.textContent = "Generazione...";

    try {
      var res = await fetch("/manager/api/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId: btn.dataset.venueId, date: btn.dataset.date }),
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || "Errore sconosciuto");

      output.value = data.text;
      output.hidden = false;
      copyBtn.hidden = false;
      sourceLabel.textContent =
        data.source === "ai" ? "Generato con AI" : "Modello di testo standard (AI non disponibile)";
    } catch (err) {
      sourceLabel.textContent = "Errore nella generazione: " + err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = "Genera messaggio";
    }
  });
});

document.querySelectorAll(".copy-message").forEach(function (btn) {
  btn.addEventListener("click", function () {
    var section = btn.closest(".venue-group");
    var output = section.querySelector(".message-output");
    navigator.clipboard.writeText(output.value).then(function () {
      btn.textContent = "Copiato!";
      setTimeout(function () {
        btn.textContent = "Copia";
      }, 1500);
    });
  });
});
