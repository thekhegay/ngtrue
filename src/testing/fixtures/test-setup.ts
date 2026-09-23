/**
 * The TestBed environment, initialised once per test file.
 *
 * `@angular/compiler` first, and not only out of habit: the spec hosts declare
 * their templates inline and are compiled just-in-time, so without it the first
 * `TestBed.createComponent` fails with a message about partial compilation that
 * says nothing about what is actually missing.
 *
 * Every spec needs this, including the ones under `src/node` that never touch a
 * fixture — a setup file is per-run rather than per-directory, and splitting it
 * would buy nothing but a second file to keep in step.
 */
import '@angular/compiler';

import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { beforeEach } from 'vitest';

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());

/**
 * A fresh TestBed per test.
 *
 * Nothing does this for us: the resetting `beforeEach` people take for granted
 * comes from Angular's own test builder, and this repository runs vitest
 * directly. Without it the second `configureTestingModule` in a file throws
 * "the test module has already been instantiated", which reads like a mistake
 * in the spec rather than a missing piece of scaffolding.
 */
beforeEach(() => {
  TestBed.resetTestingModule();
});
