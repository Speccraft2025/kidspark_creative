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

  // Generic form success handler (no backend yet — front-end confirmation only)
  function handleForm(formId, successId, resetDelay) {
    var form = document.getElementById(formId);
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var success = successId ? document.getElementById(successId) : null;
      if (success) {
        success.classList.add('show');
        setTimeout(function () { success.classList.remove('show'); }, 6000);
      }
      form.reset();
    });
  }

  handleForm('newsletterForm', 'newsletterSuccess');
  handleForm('footerForm', null);
  handleForm('contactForm', 'contactSuccess');

  var contactSuccess = document.getElementById('contactSuccess');
  if (contactSuccess) contactSuccess.classList.add('form-success');

});
