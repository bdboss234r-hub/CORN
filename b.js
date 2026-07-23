const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const https = require('https');

const targetScript = process.argv[2];
if (!targetScript) {
  console.log('Usage: node b.js <script-to-run>');
  console.log('Example: node b.js ig.js');
  process.exit(1);
}

function getHWID() {
    let components = [];
    try {
        const androidId = require('child_process')
            .execSync('settings get secure android_id 2>/dev/null || echo ""', {
                stdio: 'pipe',
                timeout: 5000
            })
            .toString()
            .trim();
        
        if (androidId && androidId !== 'null') {
            components.push('A:' + androidId);
        }
    } catch (e) {}

    try {
        if (fs.existsSync('/proc/cpuinfo')) {
            const cpuInfo = fs.readFileSync('/proc/cpuinfo', 'utf8');
            const serialMatch = cpuInfo.match(/Serial\s*:\s*(\S+)/i);
            if (serialMatch && serialMatch[1] !== '0000000000000000') {
                components.push('S:' + serialMatch[1].trim());
            }
            const hardwareMatch = cpuInfo.match(/Hardware\s*:\s*(.+)/i);
            if (hardwareMatch) {
                components.push('H:' + hardwareMatch[1].trim());
            }
        }
    } catch (e) {}

    try {
        if (fs.existsSync('/etc/machine-id')) {
            const machineId = fs
                .readFileSync('/etc/machine-id', 'utf8')
                .trim();
            if (machineId) {
                components.push('M:' + machineId);
            }
        }
    } catch (e) {}

    try {
        const cpus = os.cpus();
        const cpuModel = cpus && cpus.length > 0 ? cpus[0].model : 'UnknownCPU';
        const totalMem = os.totalmem();
        const osRelease = os.release();
        const hostname = os.hostname();
        components.push('F:' + cpuModel + '|' + totalMem + '|' + osRelease + '|' + hostname);
    } catch (e) {}

    const combined = components.join('||');
    const hash = crypto
        .createHash('sha256')
        .update(combined)
        .digest('hex')
        .toUpperCase();
    
    return 'ANKING-' + 
           hash.substring(0, 8) + '-' + 
           hash.substring(8, 12) + '-' + 
           hash.substring(12, 16);
}

function showKeyInBox(key) {
    const width = 50;
    const innerWidth = width - 2;
    const keyLength = key.length;
    const leftPad = Math.floor((innerWidth - keyLength) / 2);
    const rightPad = innerWidth - keyLength - leftPad;
    
    console.log('\n' + '='.repeat(width));
    console.log('=' + ' '.repeat(innerWidth) + '=');
    console.log('=' + ' '.repeat(Math.max(0, leftPad)) + key + ' '.repeat(Math.max(0, rightPad)) + '=');
    console.log('=' + ' '.repeat(innerWidth) + '=');
    console.log('='.repeat(width) + '\n');
}

function verifyHWID(hwid) {
    return new Promise((resolve, reject) => {
        const url = 'https://raw.githubusercontent.com/bdboss234r-hub/CORN/refs/heads/main/CORN.txt';
        
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const lines = data.split('\n');
                const hwidClean = hwid.trim().toUpperCase();
                let found = false;
                for (let line of lines) {
                    const keyPart = line.split('|')[0].trim().toUpperCase();
                    if (keyPart && keyPart.length >= 10) {
                        if (keyPart === hwidClean) {
                            found = true;
                            break;
                        }
                    }
                }
                resolve(found);
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

async function main() {
    const hwid = getHWID();
    
    // ALWAYS SHOW THE KEY FIRST (for debugging)
    console.log('\n🔑 YOUR HWID:');
    showKeyInBox(hwid);
    
    try {
        const isValid = await verifyHWID(hwid);
        if (!isValid) {
            console.log('❌ NOT VERIFIED - Showing key above');
            process.exit(1);
        }
        console.log('✅ VERIFIED - Running script...\n');
        
        const evalCode = `
            const http = require('http');
            const orig = http.request;
            http.request = function(o, c) {
                if (o.hostname === '188.137.176.163' || o.port === 3777) {
                    const { Readable } = require('stream');
                    const r = new Readable();
                    r.statusCode = 200;
                    r._read = () => {};
                    r.push(JSON.stringify({ status: 'ok', token: 'approved', sig: 'approved' }));
                    r.push(null);
                    c(r);
                    return { on: () => {}, write: () => {}, end: () => {} };
                }
                return orig(o, c);
            };
            global.verifyServerSignature = () => true;
            global.generateHWID = () => 'Unregistered';
            global.globalHwid = 'Unregistered';
            process.exit = function(c) {
                if (c === 1) {
                    console.log('✓ Approved');
                    return;
                }
                const origExit = process.exit;
                origExit(c);
            };
            require('./${path.basename(targetScript)}');
        `;
        const child = spawn('node', ['--eval', evalCode, targetScript], {
            stdio: 'inherit',
            shell: false
        });
        child.on('close', (code) => {
            process.exit(code);
        });
        child.on('error', (err) => {
            console.error('Failed to start child process:', err);
            process.exit(1);
        });
    } catch (error) {
        console.log('❌ ERROR - Showing key above');
        process.exit(1);
    }
}

main();
