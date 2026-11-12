// OpenCV.js is a CommonJS/Emscripten module whose exports include `then`. Importing it
// dynamically would hand that "thenable" namespace to the promise machinery, which keeps
// adopting it forever. This wrapper is imported dynamically instead: its own namespace has
// a single, non-thenable export.
import cv from '@techstark/opencv-js';

export const opencv = { cv: cv as unknown };
