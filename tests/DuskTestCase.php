<?php

namespace Tests;

use Facebook\WebDriver\Chrome\ChromeOptions;
use Facebook\WebDriver\Remote\DesiredCapabilities;
use Facebook\WebDriver\Remote\RemoteWebDriver;
use Illuminate\Support\Collection;
use Laravel\Dusk\TestCase as BaseTestCase;
use PHPUnit\Framework\Attributes\BeforeClass;

abstract class DuskTestCase extends BaseTestCase
{
    /**
     * Prepare for Dusk test execution.
     */
    #[BeforeClass]
    public static function prepare(): void
    {
        if (! static::runningInSail() && ! static::runningInCI()) {
            static::startChromeDriver(['--port=9515']);
        }

        static::ensureServerRunning();
    }

    public static function runningInCI(): bool
    {
        return (bool) env('CI', false);
    }

    protected function setUp(): void
    {
        parent::setUp();

        $this->artisan('migrate:fresh');
    }

    protected static function ensureServerRunning(): void
    {
        $connection = @fsockopen('localhost', 8000, $errno, $errstr, 1);

        if (is_resource($connection)) {
            fclose($connection);

            return;
        }

        $logFile = sys_get_temp_dir().'/bloom-dusk-server.log';
        $projectRoot = dirname(__DIR__);

        $proc = proc_open(
            ['php', $projectRoot.'/artisan', 'serve', '--port=8000'],
            [
                0 => ['pipe', 'r'],
                1 => ['file', $logFile, 'a'],
                2 => ['file', $logFile, 'a'],
            ],
            $pipes,
            $projectRoot,
        );

        if (is_resource($proc)) {
            fclose($pipes[0]);

            register_shutdown_function(function () use ($proc) {
                proc_terminate($proc);
                proc_close($proc);
            });
        }

        // Wait up to 10s for the server to be ready
        $deadline = microtime(true) + 10;
        while (microtime(true) < $deadline) {
            $conn = @fsockopen('localhost', 8000, $errno, $errstr, 0.5);
            if (is_resource($conn)) {
                fclose($conn);

                return;
            }
            usleep(200_000);
        }

        throw new \RuntimeException(
            'Could not start the development server on port 8000. '.
            "Check $logFile for details."
        );
    }

    /**
     * Create the RemoteWebDriver instance.
     */
    protected function driver(): RemoteWebDriver
    {
        $options = (new ChromeOptions)->addArguments(collect([
            $this->shouldStartMaximized() ? '--start-maximized' : '--window-size=1920,1080',
            '--disable-search-engine-choice-screen',
            '--disable-smooth-scrolling',
        ])->unless($this->hasHeadlessDisabled(), function (Collection $items) {
            return $items->merge([
                '--disable-gpu',
                '--headless=new',
            ]);
        })->all());

        $driverUrl = $_ENV['DUSK_DRIVER_URL'] ?? env('DUSK_DRIVER_URL')
            ?? (static::runningInCI() ? 'http://localhost:4444' : 'http://localhost:9515');

        return RemoteWebDriver::create(
            $driverUrl,
            DesiredCapabilities::chrome()->setCapability(
                ChromeOptions::CAPABILITY, $options
            )
        );
    }
}
