const fs = require('fs');

async function run() {
  const start = Date.now();
  const url = 'https://photon.komoot.io/api/?q=CampusOps%2010A%20E01&limit=1';
  
  try {
    const res = await fetch(url);
    const data = await res.json();
    const duration = Date.now() - start;
    
    const report = {
      date: new Date().toISOString(),
      provider: "Photon (https://photon.komoot.io/api/)",
      command: `fetch('${url}')`,
      httpStatus: res.status,
      durationMs: duration,
      sanitizedResult: data
    };

    fs.mkdirSync('reports/week-09', { recursive: true });
    fs.writeFileSync('reports/week-09/provider-execution.json', JSON.stringify(report, null, 2));
    console.log('Evidencia generada en reports/week-09/provider-execution.json');
  } catch (error) {
    console.error('Error de red:', error);
  }
}
run();
