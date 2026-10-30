// Uses the existing 4u-Labs identity hub. No separate user or credit database.
const CLIENT_ID =
  "569266864432-pd09jbb5no9ekdhdr018fj643nopp817.apps.googleusercontent.com";
let loading;
export async function signIn(lang = "pt") {
  const message = (pt, en) => (lang === "pt" ? pt : en);
  if (location.hostname !== "4u.ia.br")
    throw new Error(
      message(
        "A conta unificada funciona no domínio 4u.ia.br. As ferramentas locais não precisam de conta.",
        "Unified sign-in is available on 4u.ia.br. Local tools do not require an account.",
      ),
    );
  if (!loading)
    loading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.onload = resolve;
      script.onerror = () => {
        loading = null;
        reject(
          new Error(
            message(
              "Não foi possível carregar o Google.",
              "Unable to load Google.",
            ),
          ),
        );
      };
      document.head.append(script);
    });
  await loading;
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: "openid email profile",
      callback: async (result) => {
        try {
          if (!result.access_token)
            throw new Error(message("Login cancelado.", "Sign-in cancelled."));
          const response = await fetch("../keepai/api/auth.php?action=google", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ access_token: result.access_token }),
          });
          const data = await response.json();
          if (!response.ok || !data.success)
            throw new Error(
              data.error ||
                message("Falha na autenticação.", "Authentication failed."),
            );
          sessionStorage.setItem("tinylab_user_token", data.token);
          resolve(data.user);
        } catch (e) {
          reject(e);
        }
      },
      error_callback: () =>
        reject(new Error(message("Login cancelado.", "Sign-in cancelled."))),
    });
    client.requestAccessToken({ prompt: "select_account" });
  });
}
