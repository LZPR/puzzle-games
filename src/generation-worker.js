import { generatePuzzle } from "./generator.js";

self.addEventListener("message", ({ data: { size, difficulty, previousId } }) => {
  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const puzzle = generatePuzzle(size, difficulty);
      if (puzzle.id !== previousId) {
        self.postMessage({ puzzle });
        return;
      }
    }
  } catch {
    // Report bounded generation failure through the normal response.
  }
  self.postMessage({ puzzle: null });
});
