// Copy e-mail address to clipboard
const btn = document.getElementById('email-button'); // Button element acquisition
const txt = document.getElementById('email-text').textContent; // text acquisition

btn.addEventListener('click', () => { // After clicking the button, write (=copy) the text to the clipboard
  navigator.clipboard.writeText(txt);
});
