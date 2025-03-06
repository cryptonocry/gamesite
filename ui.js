import { fetchAllParticipantsFromXano } from "./api.js";

export function maskWallet(wallet) {
  if (wallet.length <= 8) return wallet;
  return wallet.substring(0,4) + "****" + wallet.substring(wallet.length - 4);
}

export async function showRecordsOverlay(recordsTableContainer, recordsContainer, currentPlayer) {
  const records = await fetchAllParticipantsFromXano();
  let html = "<table><tr><th>Никнейм</th><th>Биткойн кошелек</th><th>Счёт</th></tr>";
  let currentPlayerIndex = -1;
  records.forEach((rec, index) => {
    const shortWallet = maskWallet(rec.wallet || "");
    let rowId = "";
    if (currentPlayer && rec.nickname === currentPlayer.nickname && rec.wallet === currentPlayer.wallet) {
      rowId = " id='currentPlayerRow'";
      currentPlayerIndex = index;
    }
    html += `<tr${rowId}>
               <td>${rec.nickname}</td>
               <td>${shortWallet}</td>
               <td>${rec.score}</td>
             </tr>`;
  });
  html += "</table>";
  recordsTableContainer.innerHTML = html;
  recordsContainer.style.display = "block";
  setTimeout(() => {
    const row = document.getElementById("currentPlayerRow");
    if (row) {
      row.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, 100);
}
