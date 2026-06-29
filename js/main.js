// Kidspark Creative — site interactivity
document.addEventListener('DOMContentLoaded', function () {

  // Mobile nav toggle
  var navToggle = document.getElementById('navToggle');
  var navLinks = document.getElementById('navLinks');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', function () {
      navToggle.classList.toggle('is-open');
      navLinks.classList.toggle('mobile-open');
    });
    navLinks.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        navToggle.classList.remove('is-open');
        navLinks.classList.remove('mobile-open');
      });
    });
  }

  // Scroll reveal animation
  var revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    revealEls.forEach(function (el) { observer.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-visible'); });
  }

  // Encode a plain object as a URL-encoded form body (for Netlify Forms AJAX submission)
  function encodeForm(data) {
    return Object.keys(data)
      .map(function (key) { return encodeURIComponent(key) + '=' + encodeURIComponent(data[key]); })
      .join('&');
  }

  // Submits a form to Netlify Forms via AJAX, then shows the in-page success message.
  // Falls back to a native form POST (handled by Netlify's default thank-you redirect)
  // if fetch is unavailable or the request fails.
  function handleForm(formId, successId) {
    var form = document.getElementById(formId);
    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var data = {};
      new FormData(form).forEach(function (value, key) { data[key] = value; });

      fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: encodeForm(data)
      })
        .then(function (res) {
          if (!res.ok) throw new Error('Form submission failed: ' + res.status);
          var success = successId ? document.getElementById(successId) : null;
          if (success) {
            success.classList.add('show');
            setTimeout(function () { success.classList.remove('show'); }, 6000);
          }
          form.reset();
        })
        .catch(function () {
          alert("Sorry, that didn't go through. Please try again in a moment, or email us directly at jayzelisaac@gmail.com.");
        });
    });
  }

  handleForm('newsletterForm', 'newsletterSuccess');
  handleForm('footerForm', null);
  handleForm('contactForm', 'contactSuccess');

  var contactSuccess = document.getElementById('contactSuccess');
  if (contactSuccess) contactSuccess.classList.add('form-success');

});
