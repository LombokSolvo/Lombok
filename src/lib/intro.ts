// The first-open intro (src/components/intro-splash.tsx). Kept outside the client component so the server layout can
// inline the script as a plain string.

export const INTRO_KEY = "solvo.intro.v1";

/** Runs inline before the first paint: shows the intro only on Home and only once per browser session. */
export const INTRO_SCRIPT = `try{var s=sessionStorage;if(location.pathname!=="/"||s.getItem("${INTRO_KEY}")){document.documentElement.dataset.intro="off"}else{s.setItem("${INTRO_KEY}","1")}}catch(e){document.documentElement.dataset.intro="off"}`;
