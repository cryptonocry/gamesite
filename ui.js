import { fetchAllParticipantsFromXano } from "./api.js";

function maskWallet(wallet) {
  if (wallet.length <= 8) return wallet;
  return wallet.substring(0, 4) + "****" + wallet.substring(wallet.length - 4);
}

export async function showRecordsOverlay(recordsTableContainer, recordsContainer, currentPlayer) {
  const records = await fetchAllParticipantsFromXano();
  if (!records || records.length === 0) {
    recordsTableContainer.innerHTML = "No records found.";
    recordsContainer.style.display = "block";
    return;
  }

  // Сортируем по убыванию счёта
  records.sort((a, b) => b.score - a.score);

  // Шапка таблицы
  let html = "<table><tr><th>#</th><th>BTC Wallet</th><th>Score</th></tr>";

  // Вывод строк
  records.forEach((rec, index) => {
    const rank = index + 1; // 1,2,3,...
    const shortWallet = maskWallet(rec.wallet || "");
    let rowId = "";

    // Если это текущий игрок – помечаем строку
    if (currentPlayer && rec.wallet === currentPlayer.wallet) {
      rowId = " id='currentPlayerRow'";
    }

    html += `
      <tr${rowId}>
        <td>${rank}</td>
        <td>${shortWallet}</td>
        <td>${rec.score}</td>
      </tr>
    `;
  });

  html += "</table>";
  recordsTableContainer.innerHTML = html;
  recordsContainer.style.display = "block";

  // Скроллим к текущему игроку (если есть)
  setTimeout(() => {
    const row = document.getElementById("currentPlayerRow");
    if (row) {
      row.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, 100);
}
