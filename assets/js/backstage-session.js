(function () {
  try {
    var list = performance.getEntriesByType('navigation');
    if (list.length > 0 && list[0].type === 'reload') {
      sessionStorage.removeItem('liuzimo_backstage_ok');
      return;
    }
  } catch (e) {}
  try {
    if (performance.navigation && performance.navigation.type === 1) {
      sessionStorage.removeItem('liuzimo_backstage_ok');
    }
  } catch (e2) {}
})();
