// Replace these URLs with your actual Xano endpoints if needed
const XANO_GET_URL  = "https://x8ki-letl-twmt.n7.xano.io/api:7fuLzq6k/gamerecords_get";
const XANO_POST_URL = "https://x8ki-letl-twmt.n7.xano.io/api:7fuLzq6k/gamerecords_post";

export async function addParticipantToXano(nickname, wallet, score) {
  try {
    const body = { nickname, wallet, score };
    const response = await fetch(XANO_POST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    console.log("Added result to Xano:", data);
    return data;
  } catch (e) {
    console.error("Error sending data to Xano:", e);
    return null;
  }
}

export async function fetchAllParticipantsFromXano() {
  try {
    const response = await fetch(XANO_GET_URL);
    const data = await response.json();
    console.log("Fetched records from Xano:", data);
    return data; // array of {id, nickname, wallet, score, ...}
  } catch (e) {
    console.error("Error fetching data from Xano:", e);
    return [];
  }
}
