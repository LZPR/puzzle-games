import { generateLits } from "./lits-generator.js";

self.onmessage = ({ data: { size, difficulty, seed } }) => {
  try {
    self.postMessage({ puzzle: generateLits(size, difficulty, seed) });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
