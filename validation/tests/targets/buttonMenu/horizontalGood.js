/*
  © 2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  horizontalGood.js
  Script for validation/tests/targets/buttonMenu/horizontalGood.html
*/

const button = document.getElementById('hButton');
const menu = document.getElementById('hMenu');
const items = Array.from(menu.querySelectorAll('[role=menuitem]'));

const setActive = index => {
  items.forEach((item, itemIndex) => {
    item.tabIndex = itemIndex === index ? 0 : -1;
  });
  items[index].focus();
};

const openMenu = () => {
  button.setAttribute('aria-expanded', 'true');
  menu.className = 'open';
  setActive(0);
};

button.addEventListener('keydown', event => {
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    openMenu();
  }
});

menu.addEventListener('keydown', event => {
  const oldIndex = items.indexOf(document.activeElement);
  let newIndex = oldIndex;
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    newIndex = (oldIndex + 1) % items.length;
  }
  else if (event.key === 'ArrowLeft') {
    event.preventDefault();
    newIndex = (items.length + oldIndex - 1) % items.length;
  }
  else if (event.key === 'Home') {
    event.preventDefault();
    newIndex = 0;
  }
  else if (event.key === 'End') {
    event.preventDefault();
    newIndex = items.length - 1;
  }
  if (newIndex !== oldIndex) {
    setActive(newIndex);
  }
});
