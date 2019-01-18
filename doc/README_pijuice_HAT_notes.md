# pijuice HAT notes

## Problem
pijuice package requires Python >=3.5 and this is not availble on current raspbian verison and thus sudo apt-get install pijuice-base

## Attempt to work around with 3.4 (inclided with raspbian/openhabian)
- Get Pijuice stuff by
  - pijuice_sys.py, pijuice_gui.py and pijuice_cli.py code is python3 compatible.
    ```
    sudo apt-get download pijuice-base
    sudo dpkg -i --ignore-depends=python3,python-urwid pijuice-base_1.4_all.deb
    ```
  - pijuice service will not be running at this point
    ```
    systemctl status pijuice.service
    ```
  - To avoid noise from apt-get commands in the future remove the broken dependencies from pijuice
    - Do `sudo nano /var/lib/dpkg/status` and search for "pijuice" remove the Depends: row, save the file
    - Do `sudo apt-mark manual pijuice-base`
- Install pijuice stuff into python 3.4
    ```
    sudo cp /usr/lib/python3.5/dist-packages/pijuice* /usr/local/lib/python3.4/dist-packages/
    ```
- Manually install dependencies of pijuice
    ```
    sudo apt-get install python3-urwid python3-smbus i2c-tools
    ```
- Test using
    ```
    python3.4 -c '
    import urwid
    from smbus import SMBus
    import pijuice
    '
    ```
- Check i2c coms using:
    ```
    # Verify i2c driver is loaded, should show the '/dev/i2c-1'
    ls -l /dev/i2c-1

    # Verify modules, should list both i2c_bcm2835 and i2c_dev
    lsmod|grep i2c*

    # Should show something (the pijuice) at adress 14
    i2cdetect -y 1

    # Output firmware version etc.
    wget https://raw.githubusercontent.com/claremacrae/raspi_code/11dea107af43a236eb3e2860ddba21cbc3047e6f/hardware/pijuice/pijuice_status.py
    python3.4 pijuice_status.py
    ```
- Invoke pijuice cli by `sudo python3 /usr/bin/pijuice_cli.py`
  - sudo because rights to save `/var/lib/pijuice/pijuice_config.JSON` is required
  - Settings for "System Task" cannot be done in UI, only enable/disable. To modify settings edit `/var/lib/pijuice/pijuice_config.JSON`
    ```
    sudo nano /var/lib/pijuice/pijuice_config.JSON
    ```
  - Example config
    ```
    {
        "system_events": {
            "low_charge": {
                "function": "SYS_FUNC_HALT_POW_OFF",
                "enabled": true
            }
        },
        "system_task": {
            "watchdog": {
                "period": 4,
                "enabled": true
            },
            "wakeup_on_charge": {
                "trigger_level": 50,
                "enabled": true
            },
            "min_bat_voltage": {
                "threshold": 3.3,
                "enabled": false
            },
            "enabled": true,
            "ext_halt_power_off": {
                "period": 60,
                "enabled": true
            },
            "min_charge": {
                "threshold": 20,
                "enabled": true
            }
        }
    }
    ```
- pijuice service should be able to run at this point
    ```
    sudo systemctl start pijuice.service
    systemctl status pijuice.service
    ```
  - Restart after making changes to `/var/lib/pijuice/pijuice_config.JSON` to be sure
    ```
    sudo systemctl restart pijuice.service
    ```
- Service def file: `/lib/systemd/system/pijuice.service`

## In case flashing of firmware is necessary
Default for the pijuice HAT when received was to boot into bootloader mode, no LEDs lit up and i2c device shows only on address 41 (should be 14).

In this case I was able to flash FW by:
```
pijuiceboot 14 /usr/share/pijuice/data/firmware/PiJuice-V1.2_2018_05_02.elf.binary
```

If the HAT is not in FW bootloader mode, https://github.com/PiSupply/PiJuice/issues/105 :
```
tvoverbeek commented on May 7, 2018 •
Managed to get my PiJuice in a state where it reports only 0x41 and also with no replies at all in i2cdetect.

Try this to recover:

PiJuice mounted on the RPi, no power applied.
Remove the BP7X battery
While keeping SW3 (the middle one of the three switches) pressed apply power to the RPi (not the PiJuice)
LEDs on the PiJuice should remain off when the RPi boots.
The PiJuice is now in bootloader mode
Run pijuiceboot 14 <your favorite firmware> in a terminal or via ssh (No initial i2cdetect to test)
For me pijuiceboot runs normally and then starts the just uploaded PiJuice firmware.
In case you used the 1.2 firmware you should get the blue LED2 and a red or red/blue LED1 (since no battery connected)
For the 1.1 firmware you do not get the blue LED2.
```

## Resources
https://github.com/PiSupply/PiJuice
https://github.com/PiSupply/PiJuice/tree/master/Software
https://github.com/PiSupply/PiJuice/tree/master/Hardware


https://github.com/PiSupply/PiJuice/issues/179
https://github.com/PiSupply/PiJuice/issues/105

https://github.com/Just-Some-Bots/MusicBot/issues/960
https://www.ramoonus.nl/2018/06/30/installing-python-3-7-on-raspberry-pi/



### Attempt to work around with 3.7 (not working)
- Python 3.7.2 can be built from source by following: https://www.ramoonus.nl/2018/06/30/installing-python-3-7-on-raspberry-pi/
  - This makes altinstall, skip making aliases and skip making 3.7 default python as this probably messes up other stuff
    ```
    sudo apt-get update
    sudo apt-get install -y build-essential tk-dev libncurses5-dev libncursesw5-dev libreadline6-dev libdb5.3-dev libgdbm-dev libsqlite3-dev libssl-dev libbz2-dev libexpat1-dev liblzma-dev zlib1g-dev libffi-dev
    wget https://www.python.org/ftp/python/3.7.2/Python-3.7.2.tar.xz
    tar xf Python-3.7.2.tar.xz
    cd Python-3.7.2
    ./configure --prefix=/usr/local/opt/python-3.7.2
    make -j 4
    sudo make altinstall
    ```
- Get Pijuice stuff by
  - pijuice_sys.py, pijuice_gui.py and pijuice_cli.py code is python3 compatible.
    ```
    sudo apt-get download pijuice-base
    sudo dpkg -i --ignore-depends=python3,python-urwid pijuice-base_1.4_all.deb
    ```
  - pijuice service will not be running at this point
    ```
    systemctl status pijuice.service
    ```
  - To avoid noice from apt-get commands in the future remove the broken dependencies from pijuice
    - Do `sudo nano /var/lib/dpkg/status` and search for "pijuice" remove the Depends: row, save the file
- Install pijuice stuff into python 3.7 by copy from `/usr/lib/python2.7/dist-packages/pijuice.py` or `/usr/lib/python3.5/dist-packages/pijuice.py` or `/usr/lib/python3/dist-packages/pijuice.py` to `/usr/local/lib/python3.7/site-packages/` ?
    ```
    sudo cp /usr/lib/python3.5/dist-packages/pijuice* /usr/local/lib/python3.7/site-packages/

    sudo cp /usr/lib/python3.5/dist-packages/pijuice* /usr/local/lib/python3.4/dist-packages/
    ```
- Manually install dependencies of pijuice
    ```
    sudo apt-get install python3-urwid python3-smbus i2c-tools
    ```
- Install pijuice dependencies into python 3.7 by copy
    ```
    sudo cp -r /usr/lib/python3/dist-packages/smbus* /usr/local/lib/python3.7/site-packages/
    sudo cp -r /usr/lib/python3/dist-packages/urwid* /usr/local/lib/python3.7/site-packages/

    sudo cp -r /usr/lib/python3/dist-packages/smbus* /usr/local/lib/python3.4/dist-packages/
    sudo cp -r /usr/lib/python3/dist-packages/urwid* /usr/local/lib/python3.4/dist-packages/
    ```
- Invoke pijuice cli by `/usr/local/opt/python-3.7.2/bin/python3.7 /usr/bin/pijuice_cli.py` ?
- Make service run using python3 by modifying `/lib/systemd/system/pijuice.service` ?
