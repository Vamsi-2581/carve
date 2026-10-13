<?php

// Warm carve-php once, then fork one child per request so every render still
// starts from untouched engine state, exactly like a fresh `php` process.
// Protocol: one JSON request per line on stdin ({argv, code?}), the child's
// stdout/stderr go to fd 1/2 as inherited, "ready\n" then one "<exit code> <signal>\n" per request on fd 3.

declare(strict_types=1);

$loader = require getcwd() . '/vendor/autoload.php';

// Classes compiled in the parent are shared by every forked child; anything
// the autoloader first touches inside a child is recompiled per render.
foreach ($loader->getPrefixesPsr4() as $prefix => $dirs) {
    if ($prefix !== 'MarkupCarve\\Carve\\') {
        continue;
    }
    foreach ($dirs as $dir) {
        $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS));
        foreach ($files as $file) {
            if ($file->getExtension() !== 'php') {
                continue;
            }
            $relative = substr($file->getPathname(), strlen(rtrim($dir, '/')) + 1, -4);
            $class = $prefix . str_replace('/', '\\', $relative);
            try {
                class_exists($class) || interface_exists($class) || trait_exists($class) || enum_exists($class);
            } catch (Throwable) {
            }
        }
    }
}

$status = fopen('php://fd/3', 'w');
fwrite($status, "ready\n");
fflush($status);
$parent = posix_getppid();
while (true) {
    // The runner holds the request pipe open, so EOF never comes; a runner
    // killed before its exit hook ran is noticed by the reparenting instead.
    $read = [STDIN];
    $none = null;
    if (stream_select($read, $none, $none, 5) === 0) {
        if (posix_getppid() !== $parent) {
            exit(0);
        }
        continue;
    }
    $line = fgets(STDIN);
    if ($line === false) {
        exit(0);
    }
    $request = json_decode($line, true, flags: JSON_THROW_ON_ERROR);
    $pid = pcntl_fork();
    if ($pid === 0) {
        $argv = $request['argv'];
        $argc = count($argv);
        $_SERVER['argv'] = $argv;
        $_SERVER['argc'] = $argc;
        if (isset($request['code'])) {
            eval($request['code']);
        } else {
            require $argv[0];
        }
        exit(0);
    }
    pcntl_waitpid($pid, $wait);
    $signaled = pcntl_wifsignaled($wait);
    $code = $signaled ? -1 : pcntl_wexitstatus($wait);
    fwrite($status, $code . ' ' . ($signaled ? pcntl_wtermsig($wait) : 0) . "\n");
    fflush($status);
}
