function showNotification(type, title, message) {
  const container =
    document.getElementById("alert-container") || createAlertContainer();
  const notif = document.createElement("div");
  notif.className = `notification ${type}`;
  notif.innerHTML = `
    <div class="icon"><img src="alerts/icons/${type}.png" alt="${type} icon" /></div>
    <div class="content">
      <h4>${title}</h4>
      <p>${message}</p>
    </div>
  `;
  container.appendChild(notif);

  setTimeout(() => {
    notif.style.opacity = "0";
    setTimeout(() => notif.remove(), 300);
  }, 5000);
}
