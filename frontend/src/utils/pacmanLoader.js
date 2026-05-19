import { createElement } from './dom.js';

/**
 * Markup Pac-Man + pastilles YouTube (identique à index.html #search-loading).
 * @returns {HTMLElement}
 */
export function createPacmanLoaderMarkup() {
  const loader = createElement('div', {
    className: 'loader-pacman',
    'aria-hidden': 'true',
  });

  const circles = createElement('div', { className: 'circles' });
  for (const cls of ['one', 'two', 'three']) {
    const dot = createElement('img', {
      className: 'yt-dot',
      src: '/youtube-dot.svg',
      alt: '',
    });
    circles.appendChild(createElement('span', { className: cls }, dot));
  }
  loader.appendChild(circles);

  const pacman = createElement('div', { className: 'pacman' });
  pacman.appendChild(createElement('span', { className: 'top' }));
  pacman.appendChild(createElement('span', { className: 'bottom' }));
  pacman.appendChild(createElement('span', { className: 'left' }));
  pacman.appendChild(createElement('div', { className: 'eye' }));
  loader.appendChild(pacman);

  return loader;
}
