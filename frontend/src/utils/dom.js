/**
 * Helpers DOM
 */

/**
 * Sélectionne un élément du DOM
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
export function $(selector) {
  return document.querySelector(selector);
}

/**
 * Sélectionne tous les éléments correspondants
 * @param {string} selector
 * @returns {NodeList}
 */
export function $$(selector) {
  return document.querySelectorAll(selector);
}

/**
 * Crée un élément avec des attributs et du contenu
 * @param {string} tag
 * @param {object} attrs
 * @param {string|HTMLElement|Array} children
 * @returns {HTMLElement}
 */
export function createElement(tag, attrs = {}, children = null) {
  const el = document.createElement(tag);
  
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === 'className') {
      el.className = value;
    } else if (key === 'innerHTML') {
      el.innerHTML = value;
    } else if (key.startsWith('on')) {
      const event = key.slice(2).toLowerCase();
      el.addEventListener(event, value);
    } else {
      el.setAttribute(key, value);
    }
  });
  
  if (children) {
    if (Array.isArray(children)) {
      children.forEach(child => {
        if (typeof child === 'string') {
          el.appendChild(document.createTextNode(child));
        } else if (child instanceof HTMLElement) {
          el.appendChild(child);
        }
      });
    } else if (typeof children === 'string') {
      el.textContent = children;
    } else if (children instanceof HTMLElement) {
      el.appendChild(children);
    }
  }
  
  return el;
}

/**
 * Toggle une classe sur un élément
 * @param {HTMLElement} el
 * @param {string} className
 * @param {boolean} force
 */
export function toggleClass(el, className, force) {
  if (force !== undefined) {
    el.classList.toggle(className, force);
  } else {
    el.classList.toggle(className);
  }
}
