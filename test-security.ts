#!/usr/bin/env bun

/**
 * Security Feature Test Script
 * Run with: bun test-security.ts
 */

import chalk from 'chalk';

const BASE_URL = 'http://localhost:8787';

interface TestResult {
    name: string;
    passed: boolean;
    message: string;
}

const tests: TestResult[] = [];

async function testCORS() {
    console.log(chalk.blue('\n🔒 Testing CORS Configuration...'));
    
    // Test preflight request
    const response = await fetch(`${BASE_URL}/api/auth/providers`, {
        method: 'OPTIONS',
        headers: {
            'Origin': 'http://localhost:3000',
            'Access-Control-Request-Method': 'GET',
            'Access-Control-Request-Headers': 'Content-Type'
        }
    });
    
    const corsHeaders = {
        'Access-Control-Allow-Origin': response.headers.get('Access-Control-Allow-Origin'),
        'Access-Control-Allow-Methods': response.headers.get('Access-Control-Allow-Methods'),
        'Access-Control-Allow-Headers': response.headers.get('Access-Control-Allow-Headers'),
        'Access-Control-Max-Age': response.headers.get('Access-Control-Max-Age')
    };
    
    tests.push({
        name: 'CORS Preflight',
        passed: response.status === 204 && corsHeaders['Access-Control-Allow-Origin'] === 'http://localhost:3000',
        message: response.status === 204 ? 'Preflight handled correctly' : `Failed with status ${response.status}`
    });
    
    console.log(chalk.gray('CORS Headers:'), corsHeaders);
}

async function testSecurityHeaders() {
    console.log(chalk.blue('\n🛡️ Testing Security Headers...'));
    
    const response = await fetch(`${BASE_URL}/api/auth/providers`, {
        headers: {
            'Origin': 'http://localhost:3000'
        }
    });
    
    const securityHeaders = {
        'X-Content-Type-Options': response.headers.get('X-Content-Type-Options'),
        'X-Frame-Options': response.headers.get('X-Frame-Options'),
        'X-XSS-Protection': response.headers.get('X-XSS-Protection'),
        'Referrer-Policy': response.headers.get('Referrer-Policy'),
        'X-Request-ID': response.headers.get('X-Request-ID')
    };
    
    tests.push({
        name: 'Security Headers',
        passed: securityHeaders['X-Content-Type-Options'] === 'nosniff' &&
                securityHeaders['X-Frame-Options'] === 'DENY' &&
                !!securityHeaders['X-Request-ID'],
        message: 'Security headers properly set'
    });
    
    console.log(chalk.gray('Security Headers:'), securityHeaders);
}

async function testInvalidOrigin() {
    console.log(chalk.blue('\n🚫 Testing Invalid Origin Rejection...'));
    
    const response = await fetch(`${BASE_URL}/api/auth/providers`, {
        method: 'OPTIONS',
        headers: {
            'Origin': 'https://evil-site.com',
            'Access-Control-Request-Method': 'POST'
        }
    });
    
    tests.push({
        name: 'Invalid Origin Rejection',
        passed: response.status === 403,
        message: response.status === 403 ? 'Invalid origin rejected' : `Unexpected status ${response.status}`
    });
}

async function testRateLimit() {
    console.log(chalk.blue('\n⏱️ Testing Rate Limiting...'));
    
    // Make multiple rapid requests
    const promises = Array(10).fill(0).map(() => 
        fetch(`${BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Origin': 'http://localhost:3000'
            },
            body: JSON.stringify({
                email: 'test@example.com',
                password: 'wrongpassword'
            })
        })
    );
    
    const responses = await Promise.all(promises);
    const rateLimited = responses.some(r => r.status === 429);
    
    tests.push({
        name: 'Rate Limiting',
        passed: rateLimited,
        message: rateLimited ? 'Rate limiting active' : 'Rate limiting may not be configured'
    });
    
    if (rateLimited) {
        const limitedResponse = responses.find(r => r.status === 429);
        console.log(chalk.gray('Rate Limit Headers:'), {
            'X-RateLimit-Limit': limitedResponse?.headers.get('X-RateLimit-Limit'),
            'X-RateLimit-Remaining': limitedResponse?.headers.get('X-RateLimit-Remaining'),
            'X-RateLimit-Reset': limitedResponse?.headers.get('X-RateLimit-Reset')
        });
    }
}

async function testCSRFToken() {
    console.log(chalk.blue('\n🔑 Testing CSRF Protection...'));
    
    const response = await fetch(`${BASE_URL}/api/auth/providers`, {
        headers: {
            'Origin': 'http://localhost:3000'
        }
    });
    
    const data = await response.json();
    const hasCsrfToken = 'csrfToken' in data;
    const setCookie = response.headers.get('Set-Cookie');
    const hasExpiration = 'csrfExpiresIn' in data;
    
    tests.push({
        name: 'CSRF Token Generation',
        passed: hasCsrfToken && !!setCookie?.includes('csrf-token') && hasExpiration,
        message: hasCsrfToken ? 
            `CSRF token generated with ${data.csrfExpiresIn || 'unknown'} second TTL` : 
            'CSRF token missing'
    });
    
    if (hasCsrfToken) {
        console.log(chalk.gray('CSRF Token:'), data.csrfToken?.substring(0, 20) + '...');
        console.log(chalk.gray('Token TTL:'), data.csrfExpiresIn, 'seconds');
    }
    
    // Test CSRF validation
    await testCSRFValidation(data.csrfToken);
}

async function testCSRFValidation(csrfToken?: string) {
    console.log(chalk.blue('\n🔒 Testing CSRF Validation...'));
    
    if (!csrfToken) {
        tests.push({
            name: 'CSRF Validation',
            passed: false,
            message: 'No CSRF token available for validation test'
        });
        return;
    }
    
    // Test request without CSRF header (should fail)
    const withoutHeader = await fetch(`${BASE_URL}/api/apps`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Origin': 'http://localhost:3000'
        },
        body: JSON.stringify({ title: 'Test App' })
    });
    
    // Test request with CSRF header (should succeed or fail with auth error, not CSRF error)
    const withHeader = await fetch(`${BASE_URL}/api/apps`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Origin': 'http://localhost:3000',
            'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({ title: 'Test App' })
    });
    
    const withoutHeaderData = await withoutHeader.json();
    const withHeaderData = await withHeader.json();
    
    const csrfValidationWorking = 
        withoutHeader.status === 403 && 
        withoutHeaderData.code === 'CSRF_VIOLATION' &&
        (withHeader.status !== 403 || !withHeaderData.code?.includes('CSRF'));
    
    tests.push({
        name: 'CSRF Validation',
        passed: csrfValidationWorking,
        message: csrfValidationWorking ? 
            'CSRF validation properly enforced' : 
            'CSRF validation may not be working correctly'
    });
    
    console.log(chalk.gray('Without CSRF header:'), withoutHeader.status, withoutHeaderData.error);
    console.log(chalk.gray('With CSRF header:'), withHeader.status, withHeaderData.error);
}

async function runTests() {
    console.log(chalk.bold.cyan('\n🔐 Cloudflare Orange Build Security Test Suite\n'));
    
    try {
        await testCORS();
        await testSecurityHeaders();
        await testInvalidOrigin();
        await testRateLimit();
        await testCSRFToken();
        
        console.log(chalk.bold.yellow('\n📊 Test Results:\n'));
        
        let passed = 0;
        let failed = 0;
        
        tests.forEach(test => {
            if (test.passed) {
                console.log(chalk.green(`✅ ${test.name}: ${test.message}`));
                passed++;
            } else {
                console.log(chalk.red(`❌ ${test.name}: ${test.message}`));
                failed++;
            }
        });
        
        console.log(chalk.bold.cyan(`\n📈 Summary: ${passed}/${tests.length} tests passed`));
        
        if (failed > 0) {
            console.log(chalk.yellow('\n⚠️  Some tests failed. This may be expected in development mode.'));
            console.log(chalk.gray('Ensure ENVIRONMENT=development in .dev.vars for local testing.'));
        } else {
            console.log(chalk.green('\n✨ All security features are working correctly!'));
        }
        
    } catch (error) {
        console.error(chalk.red('\n❌ Test suite failed:'), error);
        console.log(chalk.yellow('\n💡 Make sure the server is running with: bun dev'));
    }
}

// Run tests
runTests();
