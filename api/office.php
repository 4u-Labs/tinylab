<?php
declare(strict_types=1);

/**
 * TinyLab — Ephemeral LibreOffice Headless Converter
 * Zero persistence: streams upload to an isolated temp directory, converts to PDF,
 * streams result back, and deletes all temporary files immediately on exit.
 */

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

function json_fail(int $code, string $msg): never {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    json_fail(405, 'Método não permitido / Method not allowed.');
}

$host = $_SERVER['HTTP_HOST'] ?? '';
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '') {
    $originHost = parse_url($origin, PHP_URL_HOST) ?: '';
    $reqHost = explode(':', $host)[0];
    if (!hash_equals($reqHost, $originHost)) {
        json_fail(403, 'Origem inválida / Invalid origin.');
    }
}

$ct = strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0]));
if ($ct !== 'application/octet-stream') {
    json_fail(415, 'Use application/octet-stream.');
}

$office = '/usr/bin/libreoffice';
if (!is_executable($office)) {
    json_fail(503, 'LibreOffice indisponível no servidor / LibreOffice unavailable.');
}

$limit = 25 * 1024 * 1024; // 25 MB max
$length = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($length <= 0 || $length > $limit) {
    json_fail(413, 'Limite para conversão Office: 25 MB / Office conversion limit: 25 MB.');
}

$rawName = rawurldecode((string)($_SERVER['HTTP_X_FILENAME'] ?? ''));
$ext = strtolower('.' . pathinfo($rawName, PATHINFO_EXTENSION));
$allowed = ['.docx', '.doc', '.odt', '.xlsx', '.xls', '.ods', '.ppt', '.pptx', '.odp'];
if (!in_array($ext, $allowed, true)) {
    json_fail(415, 'Formato de documento inválido / Invalid document format.');
}

$lockFp = fopen(sys_get_temp_dir() . '/tinylab-office.lock', 'c');
if ($lockFp === false || !flock($lockFp, LOCK_EX | LOCK_NB)) {
    if ($lockFp) fclose($lockFp);
    json_fail(429, 'Conversor ocupado. Tente novamente em instantes / Converter busy. Try again shortly.');
}

$tmpDir = sys_get_temp_dir() . '/tinylab-' . bin2hex(random_bytes(10));
if (!mkdir($tmpDir, 0700, true)) {
    flock($lockFp, LOCK_UN);
    fclose($lockFp);
    json_fail(500, 'Falha ao criar diretório temporário / Failed to create temp directory.');
}

$cleanup = static function () use (&$tmpDir, &$lockFp): void {
    if (is_string($tmpDir) && is_dir($tmpDir)) {
        $it = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($tmpDir, FilesystemIterator::SKIP_DOTS),
            RecursiveIteratorIterator::CHILD_FIRST
        );
        foreach ($it as $item) {
            $item->isDir() ? @rmdir($item->getPathname()) : @unlink($item->getPathname());
        }
        @rmdir($tmpDir);
        $tmpDir = null;
    }
    if (is_resource($lockFp)) {
        @flock($lockFp, LOCK_UN);
        @fclose($lockFp);
        $lockFp = null;
    }
};
register_shutdown_function($cleanup);

$srcPath = $tmpDir . '/document' . $ext;
$in = fopen('php://input', 'rb');
$out = fopen($srcPath, 'wb');
if ($in === false || $out === false) {
    json_fail(500, 'Falha de leitura / Read failure.');
}
$written = stream_copy_to_stream($in, $out, $limit + 1);
fclose($in);
fclose($out);

if ($written === false || $written <= 0 || $written > $limit) {
    json_fail(413, 'Arquivo inválido ou acima de 25 MB / Invalid file or over 25 MB.');
}

$profileUri = 'file://' . $tmpDir . '/profile';
$cmd = sprintf(
    'HOME=%s timeout 60s %s %s --headless --norestore --nofirststartwizard --convert-to pdf --outdir %s %s 2>&1',
    escapeshellarg($tmpDir),
    escapeshellarg($office),
    escapeshellarg('-env:UserInstallation=' . $profileUri),
    escapeshellarg($tmpDir),
    escapeshellarg($srcPath)
);

$outputLines = [];
$exitCode = 1;
exec($cmd, $outputLines, $exitCode);

$pdfPath = $tmpDir . '/document.pdf';
if ($exitCode !== 0 || !is_file($pdfPath) || filesize($pdfPath) < 8) {
    json_fail(422, 'Não foi possível converter este documento / Unable to convert this document.');
}

$head = file_get_contents($pdfPath, false, null, 0, 5);
if ($head !== '%PDF-') {
    json_fail(422, 'Saída PDF inválida / Invalid PDF output.');
}

header('Content-Type: application/pdf');
header('Content-Length: ' . (string)filesize($pdfPath));
readfile($pdfPath);
$cleanup();
