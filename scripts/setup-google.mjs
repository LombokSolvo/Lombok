// Saves your Google OAuth client id and secret into .env.local, so they never go through chat or the shell history.
// Run it in a terminal, from the project folder:   npm run setup:google
// It asks for the two values (the secret is not shown as you type), writes GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and SOLVO_GOOGLE=1,
// keeps the file readable by you only, and prints nothing secret. The steps to get the values are at the top of src/lib/google-calendar.ts.
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import readline from "node:readline";

const FILE = ".env.local";

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => {
        if (s.startsWith(question)) process.stdout.write(question);
        else if (s.includes("\n")) process.stdout.write("\n");
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

console.log("Google Calendar setup. Create the OAuth client first (steps at the top of src/lib/google-calendar.ts).");
console.log("The redirect address to register is exactly:  https://localhost:3000/callback/google\n");
const id = await ask("Client ID: ");
const secret = await ask("Client secret (hidden): ", { hidden: true });
if (!/\.apps\.googleusercontent\.com$/.test(id) || secret.length < 10) {
  console.log("\nThat does not look right: the client ID ends in .apps.googleusercontent.com and the secret is a longer string. Nothing was saved.");
  process.exit(1);
}

const wanted = { GOOGLE_CLIENT_ID: id, GOOGLE_CLIENT_SECRET: secret, SOLVO_GOOGLE: "1" };
const lines = existsSync(FILE) ? readFileSync(FILE, "utf8").split("\n") : [];
const kept = lines.filter((l) => !Object.keys(wanted).some((k) => l.startsWith(`${k}=`)));
while (kept.length && kept[kept.length - 1] === "") kept.pop();
writeFileSync(FILE, [...kept, ...Object.entries(wanted).map(([k, v]) => `${k}=${v}`), ""].join("\n"));
chmodSync(FILE, 0o600);

console.log(`\nSaved to ${FILE}. Next:\n  npm run dev:google\nthen open https://localhost:3000, Profile, Calendar, Connect calendar, Google Calendar.`);
