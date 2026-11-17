// The TensorFlow.js functions the app uses. Loading this module (not the whole package
// namespace) through a dynamic import keeps tree-shaking effective for the lazy TFJS chunk.
export {
  browser,
  getBackend,
  image,
  layers,
  loadLayersModel,
  memory,
  model,
  oneHot,
  ready,
  sequential,
  setBackend,
  tensor1d,
  tensor2d,
  tensor4d,
  tidy,
  train,
  zeros,
} from '@tensorflow/tfjs';
