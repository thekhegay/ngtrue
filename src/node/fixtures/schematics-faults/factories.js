'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.notAFunction = exports.fine = void 0;
const fine = () => tree => tree;
exports.fine = fine;
exports.notAFunction = { rule: fine };
