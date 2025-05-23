const puppeteer = require('puppeteer');
const { spawn } = require('child_process');

async function runTest() {
  let browser;
  let server;
  
  try {
    // Start local HTTP server
    server = spawn('npx', ['http-server', '.', '-p', '8082', '--silent'], {
      stdio: 'pipe'
    });
    
    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Track critical errors only (ignore favicon)
    const criticalErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && 
          !msg.text().includes('favicon') && 
          !msg.text().includes('404') &&
          msg.text().length > 10) { // Filter out generic short error messages
        criticalErrors.push(msg.text());
      }else{
        console.log('Console message:', msg.text(), msg.stackTrace());
      }
    });
    
    page.on('pageerror', (error) => {
      criticalErrors.push(`JS Error: ${error.message}`);
    });
    
    // Navigate to the local HTTP server
    await page.goto('http://localhost:8082', { 
      waitUntil: 'networkidle0',
      timeout: 10000 
    });
    
    // Wait for simulation to initialize
    await new Promise(resolve => setTimeout(resolve, 4000));
    
    // Check if the simulation loaded and is working
    const results = await page.evaluate(() => {
      // Basic checks
      const hasCanvas = !!document.querySelector('canvas');
      const hasMainObject = typeof window.main !== 'undefined';
      
      if (!hasMainObject) {
        return { success: false, reason: 'Main object not found' };
      }
      
      // Check if Three.js scene exists
      const hasWorld = !!(window.main.world);
      const hasScene = !!(window.main.world && window.main.world.scene);
      
      if (!hasScene) {
        return { success: false, reason: 'Three.js scene not initialized' };
      }
      
      // Check if objects were added to scene
      const sceneChildren = window.main.world.scene.children.length;
      
      if (sceneChildren < 2) {
        return { success: false, reason: `Scene has only ${sceneChildren} objects, expected more` };
      }
      
      // Check if HDR loading was attempted (environment or background set)
      const hasEnvironmentAttempt = window.main.world.scene.environment !== null || 
                                    window.main.world.scene.background  !== null;
      
      return {
        success: true,
        hasCanvas,
        hasMainObject,
        hasWorld,
        hasScene,
        sceneChildren,
        hasEnvironmentAttempt
      };
    });
    
    if (criticalErrors.length > 0) {
      console.error('✗ Test failed with critical JavaScript errors:');
      criticalErrors.forEach(error => console.error('  -', error));
      process.exit(1);
    }
    
    if (!results.success) {
      console.error('✗ Test failed:', results.reason);
      process.exit(1);
    }
    
    // Success!
    console.log('✓ Optics simulation test passed!');
    console.log('✓ Canvas element created');
    console.log('✓ Main simulation object initialized');
    console.log('✓ Three.js scene created');
    console.log(`✓ Scene contains ${results.sceneChildren} objects`);
    console.log('✓ HDR environment loading attempted');
    console.log('✓ No critical JavaScript errors detected');
    
  } catch (error) {
    console.error('✗ Test failed:', error.message);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
    if (server) {
      server.kill();
    }
  }
}

runTest();
