$headers = @{"Content-Type"="application/json"}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "   API PRIVATE IP VALIDATION TESTS" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# TEST 1: Valid Private IP (Class A)
Write-Host "TEST 1: Valid Private IP - Class A (10.0.0.0/16)" -ForegroundColor Green
$body = '{"deploymentSize":"professional","vpcCidr":"10.0.0.0/16"}'
try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:5000/api/kubernetes/network-plan" -Method POST -Headers $headers -Body $body -UseBasicParsing
    Write-Host "  Result: SUCCESS (200)" -ForegroundColor Green
    $json = $resp.Content | ConvertFrom-Json
    Write-Host "  VPC: $($json.vpc.cidr)"
    Write-Host "  Deployment Size: $($json.deploymentSize)"
    Write-Host "  Subnets: $($json.subnets.public.length) public, $($json.subnets.private.length) private" -ForegroundColor Green
} catch {
    Write-Host "  Result: FAILED - $($_.Exception.Message)" -ForegroundColor Red
}

# TEST 2: Valid Private IP (Class B)
Write-Host "`nTEST 2: Valid Private IP - Class B (172.16.0.0/16)" -ForegroundColor Green
$body = '{"deploymentSize":"professional","vpcCidr":"172.16.0.0/16"}'
try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:5000/api/kubernetes/network-plan" -Method POST -Headers $headers -Body $body -UseBasicParsing
    Write-Host "  Result: SUCCESS (200)" -ForegroundColor Green
    $json = $resp.Content | ConvertFrom-Json
    Write-Host "  VPC: $($json.vpc.cidr)" -ForegroundColor Green
} catch {
    Write-Host "  Result: FAILED - $($_.Exception.Message)" -ForegroundColor Red
}

# TEST 3: Valid Private IP (Class C)
Write-Host "`nTEST 3: Valid Private IP - Class C (192.168.0.0/16)" -ForegroundColor Green
$body = '{"deploymentSize":"standard","vpcCidr":"192.168.0.0/16"}'
try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:5000/api/kubernetes/network-plan" -Method POST -Headers $headers -Body $body -UseBasicParsing
    Write-Host "  Result: SUCCESS (200)" -ForegroundColor Green
    $json = $resp.Content | ConvertFrom-Json
    Write-Host "  VPC: $($json.vpc.cidr)" -ForegroundColor Green
} catch {
    Write-Host "  Result: FAILED - $($_.Exception.Message)" -ForegroundColor Red
}

# TEST 4: INVALID - Public IP (should be REJECTED)
Write-Host "`nTEST 4: INVALID Public IP (8.8.8.0/16) - Should REJECT" -ForegroundColor Yellow
$body = '{"deploymentSize":"professional","vpcCidr":"8.8.8.0/16"}'
try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:5000/api/kubernetes/network-plan" -Method POST -Headers $headers -Body $body -UseBasicParsing
    Write-Host "  Result: FAILED - Should have been rejected!" -ForegroundColor Red
    Write-Host "  Got response when request should fail" -ForegroundColor Red
} catch {
    if ($_.Exception.Response) {
        Write-Host "  Result: CORRECTLY REJECTED (Status $($_.Exception.Response.StatusCode))" -ForegroundColor Green
        try {
            $stream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $content = $reader.ReadToEnd()
            $errJson = $content | ConvertFrom-Json
            if ($errJson.error) {
                Write-Host "  Error Message: $($errJson.error)" -ForegroundColor Green
            }
        } catch {
            Write-Host "  Response: $content" -ForegroundColor Green
        }
    } else {
        Write-Host "  Result: FAILED - No response object - $($_.Exception.Message)" -ForegroundColor Red
    }
}

# TEST 5: INVALID - Public IP Class C (should be REJECTED)
Write-Host "`nTEST 5: INVALID Public IP (200.0.0.0/16) - Should REJECT" -ForegroundColor Yellow
$body = '{"deploymentSize":"professional","vpcCidr":"200.0.0.0/16"}'
try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:5000/api/kubernetes/network-plan" -Method POST -Headers $headers -Body $body -UseBasicParsing
    Write-Host "  Result: FAILED - Should have been rejected!" -ForegroundColor Red
} catch {
    if ($_.Exception.Response) {
        Write-Host "  Result: CORRECTLY REJECTED (Status $($_.Exception.Response.StatusCode))" -ForegroundColor Green
    } else {
        Write-Host "  Result: FAILED - $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "   TESTS COMPLETE" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan
