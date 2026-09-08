/** Configuração pública do aplicativo Web no Firebase. */
export const firebaseConfig = {
  apiKey: "AIzaSyBHD50A3Q68ZkZjDLEmq5QfiW7Z2VEMMfE",
  authDomain: "domino-numeros-racionais.firebaseapp.com",
  databaseURL: "https://domino-numeros-racionais-default-rtdb.firebaseio.com",
  projectId: "domino-numeros-racionais",
  storageBucket: "domino-numeros-racionais.firebasestorage.app",
  messagingSenderId: "747440354401",
  appId: "1:747440354401:web:64798303669ed81c6ba620"
};

export function isFirebaseConfigured() {
  return Object.values(firebaseConfig).every((value) => Boolean(value));
}
