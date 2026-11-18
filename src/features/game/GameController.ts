export class GameController {
  score = 0;
  fps = 0;
  /** Current speed relative to the start of the round (1.0 = starting speed). */
  tempo = 1;
  paused = false;
  jump: () => void = () => {};
  setPaused: (paused: boolean) => void = () => {};
  onScore: (score: number) => void = () => {};
  onOver: (score: number) => void = () => {};
  reset() {
    this.score = 0;
    this.fps = 0;
    this.tempo = 1;
    this.paused = false;
    this.jump = () => {};
    this.setPaused = () => {};
  }
}
