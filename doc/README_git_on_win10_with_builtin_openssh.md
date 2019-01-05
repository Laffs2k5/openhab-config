# Git on Windows 10 with windows's built-in OpenSSH client

## Enable Built in OpenSSH client
1. Enable Developer Mode on Windows 10 to get the latest features. You can find this option in Update & Security section in Settings.
2. In Administrator PS Window
```
$latest = (Get-WindowsCapability -Online | ? Name -like 'OpenSSH.Client*').Name
Add-WindowsCapability -Online -Name $latest
Get-Service ssh-agent | Set-Service -StartupType Automatic
Get-Service ssh-agent | Start-Service
```
Verify with
```
ssh-add.exe -l
```

## Install and configure git
Using Chocolatey: https://chocolatey.org/install
In Administrator Command Window
```
choco install git -params '"/GitAndUnixToolsOnPath"'
```

Make git use builtin OpenSSH
(the risk is that git using the ssh bundled with git installation)
```
git config --global core.sshCommand "C:/Windows/System32/OpenSSH/ssh.exe"
```

Set other config
```
git config --global user.name "User Name"
git config --global user.email "user@email.com"
```

## Configure ssh for github
If you have no keys, check with `ls ~/.ssh`
```
ssh-keygen -t rsa -b 4096 -C "your_email@example.com"
```

If SSH has no keys, check with `ssh-add -l`
```
ssh-add ~/.ssh/id_rsa
```

Add SSH key to your GitHub account: https://help.github.com/articles/adding-a-new-ssh-key-to-your-github-account/

Verify with
```
ssh -T git@github.com
```

