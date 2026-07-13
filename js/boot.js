if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
document.getElementById('split-bill-section')?.style.setProperty('display',FEATURE_SPLIT_BILL?'block':'none');
showSplash();
