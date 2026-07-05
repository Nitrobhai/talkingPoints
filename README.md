# 🎤 Talking Points

A **party game** you play with friends in the same room — like a Jackbox game!

One player (the **Speaker**) has to give a funny presentation about slides they've
**never seen before**. Another player (the **Assistant**) secretly picks which slides
show up, to surprise the speaker. Everyone else (the **Audience**) watches and then
rates the talk from **0 to 10** using a slider on their phone.

The player with the most points after a few rounds wins. 🏆

---

## 👀 What it looks like

- **One big screen** (a laptop or TV) shows a **QR code** to join and shows the slides.
- **Everyone's phone** becomes their controller — they scan the QR code to join.

That's the same idea as Jackbox: the TV is the "game board" and phones are the "controllers".

---

## 🚀 How to run it (step by step)

You only need to do this once to get it working on your computer.

**1. Install [Node.js](https://nodejs.org/)** (the thing that runs our code). Get the "LTS" version.

**2. Open a terminal** in this project's folder and install the helper libraries:

```bash
npm install
```

**3. Start the game server:**

```bash
npm start
```

You'll see a message like this (your numbers will be different):

```
🎤 Talking Points is running!

   On THIS computer:            http://localhost:3000
   For phones (same Wi-Fi):     http://192.168.1.20:3000   <-- open the TV screen here
```

**4. Open the TV screen** at the **"For phones (same Wi-Fi)"** address it printed
(like `http://192.168.1.20:3000`). Click **"Create a Room"** and a QR code appears.

> 💡 Tip: opening `localhost` works too — the game is smart enough to build the QR code
> using your Wi-Fi address anyway. But opening the Wi-Fi address is the safest.

**5. Join with phones.** Each player scans the QR code with their phone's camera, types
a name, and taps **Join**. (Or they can go to the address shown and type the 4-letter
room code by hand.)

> 📶 **The one rule:** the phones and the host computer must be on the **same Wi-Fi**.
> That's it — no accounts, no installs on the phones.

**6. Start the game** once **at least 3 people** have joined, and have fun!

---

## 🎮 How to play

Each **round** goes like this:

1. The game picks a **Speaker** and an **Assistant**. Everyone else is the **Audience**.
   (These roles rotate every round so everybody gets a turn to speak.)
2. A slide appears on the big screen. The **Speaker** has to talk about it out loud —
   they didn't get to see it coming, so they just make something up. That's the fun part!
3. The **Assistant** taps their phone to choose the next slide from **2 options**. They
   can pick something silly to mess with the speaker. 😈
4. This repeats for a few slides until the talk is over.
5. **Voting time!** Each Audience member drags a **slider from 0.0 to 10.0** (you can pick
   exact scores like 3.5, 7.2, or 9.9) and taps **Submit Vote**. The speaker and assistant
   don't vote — they're the ones being judged!
6. The game shows the **average score**. The Speaker earns that many points, and the
   Assistant earns **half** of it (they were a team). Then the host starts the next round.

You need **3 players minimum**: one speaker, one assistant, and at least one voter.

---

## 🗂️ What's in each file

Here's a map of the project so you know where everything lives:

| File | What it does |
|------|--------------|
| `server.js` | The **brain** of the game (the "referee"). It keeps track of players, roles, slides, and scores, and tells every screen what to show. Runs on the computer, not in the browser. |
| `public/index.html` | The **TV screen** web page. Open this on the big screen. |
| `public/host.js` | The code that runs the TV screen (shows the QR code, slides, and scores). |
| `public/play.html` | The **phone** web page (the controller). |
| `public/play.js` | The code that runs on each phone (join screen, slide-picking buttons, and the voting slider). |
| `public/style.css` | The **paint** — all the colors, fonts, and layout. |
| `package.json` | A list of the helper libraries our project needs. |

The word **"public"** means those files get sent straight to web browsers.

---

## 🛠️ Fun things to change (great for practice!)

Everything below is beginner-friendly. Change one thing, save, restart with `npm start`,
and refresh the page to see it.

- **Add your own slides / jokes:** open `server.js` and look for `TITLE_SLIDES`,
  `PICTURE_SLIDES`, `TEXT_SLIDES`, and `OUTRO_SLIDES` near the top. Each slide is just an
  emoji and some text. Add more items to the lists!

- **Make talks longer or shorter:** in `server.js`, find `SCRIPT`. It's a list of slide
  types in order. Add or remove items to change how many slides each talk has.

- **Change the scoring:** in `server.js`, find `ASSISTANT_SCORE_SHARE = 0.5`. That's the
  fraction of points the assistant gets. Change `0.5` to `1` to give them full points, or
  `0.25` for a quarter.

- **Change the colors:** open `public/style.css` and look at the `:root` section at the
  top. Change the color codes (like `--accent: #ff5da2;`) to recolor the whole game.

---

## 📱 Playing on real phones (same Wi-Fi)

`localhost` only works on the computer itself. To let phones join:

1. Find your computer's **local IP address**:
   - **Windows:** open Command Prompt and type `ipconfig`, look for "IPv4 Address".
   - **Mac:** System Settings → Wi-Fi → Details, look for "IP Address".
   - It looks like `192.168.x.x`.
2. Make sure the phones are on the **same Wi-Fi** as the computer.
3. On the TV screen computer, open the game at that address, e.g. `http://192.168.1.20:3000`.
   The QR code will then point phones to the right place automatically. ✅

## 🌐 Putting it online (so anyone can join from anywhere)

If you want a real public link (like a true Jackbox game), you can host it for free on a
service like [Render](https://render.com/) or [Railway](https://railway.app/). Upload this
project, set the start command to `npm start`, and they'll give you a public web address.
The QR code will automatically use that address — no extra setup needed, because the code
builds the join link from whatever address the TV screen is opened at.

---

## 🧠 A few words you'll see in the code

- **server** — the program that runs the game and connects everyone.
- **socket** — a live, always-open connection so the server and phones can send messages
  back and forth instantly (used by a library called **socket.io**).
- **broadcast** — sending the same message to everyone in the room at once.
- **state** — a snapshot of everything happening in the game right now (who's playing,
  whose turn it is, the current slide, the scores). The server sends this to every screen
  whenever something changes.

Have fun, and don't be afraid to break things — you can always undo! 🎉
