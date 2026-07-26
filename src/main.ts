import './style.css'

// Milestone 1: scaffold only. This proves the build, the base path and the Pages
// deployment work end to end before any camera or audio code exists.
// Milestone 2 replaces the body of start() with camera + hand tracking.

const startScreen = document.querySelector<HTMLDivElement>('#start-screen')!
const startButton = document.querySelector<HTMLButtonElement>('#start-button')!
const startError = document.querySelector<HTMLParagraphElement>('#start-error')!
const hud = document.querySelector<HTMLDivElement>('#hud')!

function showError(message: string): void {
  startError.textContent = message
  startError.hidden = false
  startButton.disabled = false
  startButton.textContent = 'Try again'
}

async function start(): Promise<void> {
  startButton.disabled = true
  startError.hidden = true

  hud.textContent = 'scaffold ok — camera and audio land in milestone 2'
  startScreen.hidden = true
}

startButton.addEventListener('click', () => {
  start().catch((error: unknown) => {
    showError(error instanceof Error ? error.message : String(error))
  })
})
