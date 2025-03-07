import { fetchAllParticipantsFromXano } from "./api.js";

// Mask the wallet: first 4 chars, then ****, then last 4 chars
function maskWallet(wallet) {
  if (wallet.length <= 8) return wallet;
  return wallet.substring(0, 4) + "****" + wallet.substring(wallet.length - 4);
}

export async function showRecordsOverlay(recordsTableContainer, recordsContainer, currentPlayer) {
  const records = await fetchAllParticipantsFromXano();
  let html = "<table><tr><th>Wallet</th><th>Score</th></tr>";
  records.forEach((rec) => {
    const shortWallet = maskWallet(rec.wallet || "");
    html += `<tr>
               <td>${shortWallet}</td>
               <td>${rec.score}</td>
             </tr>`;
  });
  html += "</table>";
  recordsTableContainer.innerHTML = html;
  recordsContainer.style.display = "block";
}
