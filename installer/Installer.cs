using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using Microsoft.Win32;

#if UNINSTALL_ONLY
[assembly: AssemblyTitle("SteamEdge Uninstaller")]
#else
[assembly: AssemblyTitle("SteamEdge Setup")]
#endif
[assembly: AssemblyDescription("Windows x64 installer for SteamEdge 1.3.2")]
[assembly: AssemblyCompany("SteamEdge contributors")]
[assembly: AssemblyProduct("SteamEdge")]
[assembly: AssemblyCopyright("Copyright (C) 2026 SteamEdge contributors")]
[assembly: AssemblyVersion("1.3.2.0")]
[assembly: AssemblyFileVersion("1.3.2.0")]

namespace SteamEdgeSetup
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
#if UNINSTALL_ONLY
            Application.Run(new UninstallerForm());
#else
            Application.Run(new InstallerForm());
#endif
        }
    }

#if !UNINSTALL_ONLY
    internal sealed class InstallRequest
    {
        public string InstallDirectory;
        public bool CreateDesktopShortcut;
    }

    internal sealed class InstallerForm : Form
    {
        private readonly string installDirectory;
        private readonly CheckBox desktopShortcut;
        private readonly Button installButton;
        private readonly Button cancelButton;
        private readonly ProgressBar progress;
        private readonly Label status;
        private readonly BackgroundWorker worker;

        public InstallerForm()
        {
            installDirectory = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Programs", "SteamEdge");

            Text = "SteamEdge Setup";
            ClientSize = new Size(550, 335);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            Font = new Font("Segoe UI", 9F);

            Label heading = new Label();
            heading.Text = "Install SteamEdge 1.3.2";
            heading.Font = new Font("Segoe UI", 18F, FontStyle.Bold);
            heading.SetBounds(26, 22, 490, 38);
            Controls.Add(heading);

            Label intro = new Label();
            intro.Text = "The English SteamEdge desktop app will be installed for your Windows account. " +
                         "No administrator permission, Node.js, or separate Steam client is needed.";
            intro.SetBounds(28, 70, 490, 54);
            intro.AutoSize = false;
            Controls.Add(intro);

            Label destinationLabel = new Label();
            destinationLabel.Text = "Install location:";
            destinationLabel.SetBounds(28, 143, 490, 20);
            Controls.Add(destinationLabel);

            TextBox destination = new TextBox();
            destination.Text = installDirectory;
            destination.ReadOnly = true;
            destination.SetBounds(28, 166, 490, 25);
            Controls.Add(destination);

            desktopShortcut = new CheckBox();
            desktopShortcut.Text = "Create a desktop shortcut";
            desktopShortcut.Checked = true;
            desktopShortcut.SetBounds(28, 205, 490, 24);
            Controls.Add(desktopShortcut);

            status = new Label();
            status.Text = "Your settings and saved account data are kept on this computer.";
            status.SetBounds(28, 240, 490, 20);
            Controls.Add(status);

            progress = new ProgressBar();
            progress.SetBounds(28, 265, 490, 14);
            progress.Visible = false;
            Controls.Add(progress);

            installButton = new Button();
            installButton.Text = "Install";
            installButton.SetBounds(332, 294, 88, 28);
            installButton.Click += BeginInstall;
            Controls.Add(installButton);

            cancelButton = new Button();
            cancelButton.Text = "Cancel";
            cancelButton.SetBounds(430, 294, 88, 28);
            cancelButton.Click += delegate { Close(); };
            Controls.Add(cancelButton);

            AcceptButton = installButton;
            CancelButton = cancelButton;

            worker = new BackgroundWorker();
            worker.WorkerReportsProgress = true;
            worker.DoWork += InstallFiles;
            worker.ProgressChanged += UpdateProgress;
            worker.RunWorkerCompleted += FinishInstall;
        }

        private void BeginInstall(object sender, EventArgs e)
        {
            if (!Environment.Is64BitOperatingSystem)
            {
                MessageBox.Show(this, "SteamEdge 1.3.2 requires 64-bit Windows.", "SteamEdge Setup",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }
            if (Process.GetProcessesByName("SteamEdge").Length != 0)
            {
                MessageBox.Show(this, "Close SteamEdge completely, including its tray icon, and run Setup again.",
                    "SteamEdge Setup", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            installButton.Enabled = false;
            cancelButton.Enabled = false;
            desktopShortcut.Enabled = false;
            progress.Visible = true;
            progress.Style = ProgressBarStyle.Marquee;
            status.Text = "Installing SteamEdge. This may take a few minutes...";
            worker.RunWorkerAsync(new InstallRequest {
                InstallDirectory = installDirectory,
                CreateDesktopShortcut = desktopShortcut.Checked
            });
        }

        private void InstallFiles(object sender, DoWorkEventArgs e)
        {
            InstallRequest request = (InstallRequest)e.Argument;
            BackgroundWorker progressWorker = (BackgroundWorker)sender;
            string root = Path.GetFullPath(request.InstallDirectory).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            Directory.CreateDirectory(root);

            using (Stream payload = Assembly.GetExecutingAssembly().GetManifestResourceStream("SteamEdge.Payload.zip"))
            {
                if (payload == null) throw new InvalidOperationException("The SteamEdge application package is missing.");
                using (ZipArchive archive = new ZipArchive(payload, ZipArchiveMode.Read))
                {
                    List<ZipArchiveEntry> entries = new List<ZipArchiveEntry>(archive.Entries);
                    int completed = 0;
                    foreach (ZipArchiveEntry entry in entries)
                    {
                        string relative = entry.FullName.Replace('/', Path.DirectorySeparatorChar);
                        string firstPart = relative.Split(Path.DirectorySeparatorChar)[0];
                        if (String.Equals(firstPart, "settings", StringComparison.OrdinalIgnoreCase) ||
                            String.Equals(firstPart, "cache", StringComparison.OrdinalIgnoreCase) ||
                            String.Equals(relative, "README.txt", StringComparison.OrdinalIgnoreCase))
                        {
                            completed++;
                            progressWorker.ReportProgress(entries.Count == 0 ? 100 : (completed * 100 / entries.Count));
                            continue;
                        }

                        string destination = Path.GetFullPath(Path.Combine(root, relative));
                        if (!destination.StartsWith(root, StringComparison.OrdinalIgnoreCase))
                            throw new InvalidDataException("The application archive contains an invalid file path.");

                        if (relative.EndsWith(Path.DirectorySeparatorChar.ToString(), StringComparison.Ordinal))
                        {
                            Directory.CreateDirectory(destination);
                        }
                        else
                        {
                            Directory.CreateDirectory(Path.GetDirectoryName(destination));
                            using (Stream source = entry.Open())
                            using (FileStream target = new FileStream(destination, FileMode.Create, FileAccess.Write, FileShare.None))
                                source.CopyTo(target);
                        }
                        completed++;
                        progressWorker.ReportProgress(entries.Count == 0 ? 100 : (completed * 100 / entries.Count));
                    }
                }
            }

            Directory.CreateDirectory(Path.Combine(root, "settings"));
            Directory.CreateDirectory(Path.Combine(root, "cache"));
            File.WriteAllText(Path.Combine(root, "README.txt"), QuickStartText, new System.Text.UTF8Encoding(false));

            string uninstallerPath = Path.Combine(root, "Uninstall-SteamEdge.exe");
            using (Stream uninstaller = Assembly.GetExecutingAssembly().GetManifestResourceStream("SteamEdge.Uninstaller.exe"))
            {
                if (uninstaller == null) throw new InvalidOperationException("The uninstaller component is missing.");
                using (FileStream target = new FileStream(uninstallerPath, FileMode.Create, FileAccess.Write, FileShare.None))
                    uninstaller.CopyTo(target);
            }
            e.Result = request;
        }

        private void UpdateProgress(object sender, ProgressChangedEventArgs e)
        {
            progress.Style = ProgressBarStyle.Continuous;
            progress.Value = Math.Max(0, Math.Min(100, e.ProgressPercentage));
        }

        private void FinishInstall(object sender, RunWorkerCompletedEventArgs e)
        {
            if (e.Error != null)
            {
                installButton.Enabled = true;
                cancelButton.Enabled = true;
                desktopShortcut.Enabled = true;
                progress.Visible = false;
                status.Text = "Setup could not complete.";
                MessageBox.Show(this, "SteamEdge could not be installed.\r\n\r\n" + e.Error.Message,
                    "SteamEdge Setup", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            try
            {
                InstallRequest request = (InstallRequest)e.Result;
                CreateShortcuts(request.InstallDirectory, request.CreateDesktopShortcut);
                RegisterUninstaller(request.InstallDirectory);

                DialogResult launch = MessageBox.Show(this,
                    "SteamEdge 1.3.2 is installed. Your settings and saved accounts are stored locally beside the app.\r\n\r\nOpen SteamEdge now?",
                    "Installation complete", MessageBoxButtons.YesNo, MessageBoxIcon.Information);
                if (launch == DialogResult.Yes)
                {
                    Process.Start(new ProcessStartInfo {
                        FileName = Path.Combine(request.InstallDirectory, "SteamEdge.exe"),
                        WorkingDirectory = request.InstallDirectory,
                        UseShellExecute = true
                    });
                }
                Close();
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, "SteamEdge files were copied, but Windows could not finish creating shortcuts or the uninstall entry.\r\n\r\n" + ex.Message,
                    "SteamEdge Setup", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private static void CreateShortcuts(string directory, bool createDesktop)
        {
            string startMenu = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "Microsoft", "Windows", "Start Menu", "Programs", "SteamEdge");
            Directory.CreateDirectory(startMenu);
            CreateShortcut(Path.Combine(startMenu, "SteamEdge.lnk"), directory);
            if (createDesktop)
            {
                string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                CreateShortcut(Path.Combine(desktop, "SteamEdge.lnk"), directory);
            }
        }

        private static void CreateShortcut(string shortcutPath, string directory)
        {
            Type shellType = Type.GetTypeFromProgID("WScript.Shell");
            if (shellType == null) throw new InvalidOperationException("Windows could not create a shortcut.");
            object shell = Activator.CreateInstance(shellType);
            object shortcut = null;
            try
            {
                shortcut = shellType.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { shortcutPath });
                Type shortcutType = shortcut.GetType();
                string target = Path.Combine(directory, "SteamEdge.exe");
                shortcutType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, shortcut, new object[] { target });
                shortcutType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, shortcut, new object[] { directory });
                shortcutType.InvokeMember("IconLocation", BindingFlags.SetProperty, null, shortcut, new object[] { target + ",0" });
                shortcutType.InvokeMember("Description", BindingFlags.SetProperty, null, shortcut, new object[] { "SteamEdge 1.3.2" });
                shortcutType.InvokeMember("Save", BindingFlags.InvokeMethod, null, shortcut, null);
            }
            finally
            {
                if (shortcut != null && Marshal.IsComObject(shortcut)) Marshal.ReleaseComObject(shortcut);
                if (Marshal.IsComObject(shell)) Marshal.ReleaseComObject(shell);
            }
        }

        private static void RegisterUninstaller(string directory)
        {
            using (RegistryKey key = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\SteamEdge"))
            {
                if (key == null) throw new InvalidOperationException("Windows could not register the uninstaller.");
                string uninstaller = Path.Combine(directory, "Uninstall-SteamEdge.exe");
                key.SetValue("DisplayName", "SteamEdge", RegistryValueKind.String);
                key.SetValue("DisplayVersion", "1.3.2", RegistryValueKind.String);
                key.SetValue("Publisher", "SteamEdge contributors", RegistryValueKind.String);
                key.SetValue("InstallLocation", directory, RegistryValueKind.String);
                key.SetValue("DisplayIcon", Path.Combine(directory, "SteamEdge.exe"), RegistryValueKind.String);
                key.SetValue("UninstallString", "\"" + uninstaller + "\"", RegistryValueKind.String);
                key.SetValue("NoModify", 1, RegistryValueKind.DWord);
                key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
            }
        }

        private const string QuickStartText =
            "SteamEdge 1.3.2\r\n\r\n" +
            "GET STARTED\r\n" +
            "Open SteamEdge from the desktop or Start Menu shortcut and sign in with Steam.\r\n\r\n" +
            "YOUR DATA\r\n" +
            "Settings, saved accounts, and Steam session data are stored in the settings folder beside SteamEdge.exe.\r\n" +
            "The installer contains no account data. Keep the settings folder private and do not share it.\r\n\r\n" +
            "UNINSTALL\r\n" +
            "Use Windows Settings > Apps > Installed apps > SteamEdge. You can choose to keep or remove your settings and saved session.\r\n\r\n" +
            "LICENSE\r\n" +
            "SteamEdge is distributed under the GNU Affero General Public License v3.0 or later. See LICENSE in this folder.\r\n";
    }
#endif

#if UNINSTALL_ONLY
    internal sealed class UninstallerForm : Form
    {
        private readonly CheckBox removeData;

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool MoveFileEx(string existingFileName, string newFileName, int flags);

        public UninstallerForm()
        {
            Text = "Uninstall SteamEdge";
            ClientSize = new Size(500, 205);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            Font = new Font("Segoe UI", 9F);

            Label heading = new Label();
            heading.Text = "Remove SteamEdge 1.3.2?";
            heading.Font = new Font("Segoe UI", 15F, FontStyle.Bold);
            heading.SetBounds(24, 22, 450, 30);
            Controls.Add(heading);

            Label explanation = new Label();
            explanation.Text = "Your settings and saved Steam session are kept by default.";
            explanation.SetBounds(26, 62, 450, 24);
            Controls.Add(explanation);

            removeData = new CheckBox();
            removeData.Text = "Also delete settings, saved accounts, and cache";
            removeData.SetBounds(26, 98, 450, 24);
            Controls.Add(removeData);

            Button removeButton = new Button();
            removeButton.Text = "Uninstall";
            removeButton.SetBounds(283, 151, 88, 28);
            removeButton.Click += RemoveApplication;
            Controls.Add(removeButton);

            Button cancelButton = new Button();
            cancelButton.Text = "Cancel";
            cancelButton.SetBounds(382, 151, 88, 28);
            cancelButton.Click += delegate { Close(); };
            Controls.Add(cancelButton);

            AcceptButton = removeButton;
            CancelButton = cancelButton;
        }

        private void RemoveApplication(object sender, EventArgs e)
        {
            if (Process.GetProcessesByName("SteamEdge").Length != 0)
            {
                MessageBox.Show(this, "Close SteamEdge completely, including its tray icon, and run the uninstaller again.",
                    "Uninstall SteamEdge", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            string root = Path.GetFullPath(Application.StartupPath).TrimEnd(Path.DirectorySeparatorChar);
            DialogResult confirm = MessageBox.Show(this,
                removeData.Checked
                    ? "This removes the app, its saved settings, Steam sessions, and cache. Continue?"
                    : "This removes the app but keeps your settings and saved Steam session in the settings folder. Continue?",
                "Uninstall SteamEdge", MessageBoxButtons.OKCancel, MessageBoxIcon.Warning);
            if (confirm != DialogResult.OK) return;

            try
            {
                RemoveShortcuts();
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall", true))
                {
                    if (key != null) key.DeleteSubKeyTree("SteamEdge", false);
                }

                string[] entries = Directory.GetFileSystemEntries(root);
                foreach (string entry in entries)
                {
                    string name = Path.GetFileName(entry);
                    bool dataDirectory = String.Equals(name, "settings", StringComparison.OrdinalIgnoreCase) ||
                                         String.Equals(name, "cache", StringComparison.OrdinalIgnoreCase);
                    bool self = String.Equals(name, "Uninstall-SteamEdge.exe", StringComparison.OrdinalIgnoreCase);
                    if (dataDirectory && !removeData.Checked) continue;
                    if (self)
                    {
                        // Windows removes the running uninstaller after the next restart.
                        MoveFileEx(entry, null, 0x4);
                        continue;
                    }
                    if (Directory.Exists(entry)) Directory.Delete(entry, true);
                    else File.Delete(entry);
                }

                MessageBox.Show(this,
                    removeData.Checked
                        ? "SteamEdge and its saved data have been removed. The small uninstaller file will be removed after Windows restarts."
                        : "SteamEdge has been removed. Your settings and saved account data remain in:\r\n" + Path.Combine(root, "settings"),
                    "Uninstall complete", MessageBoxButtons.OK, MessageBoxIcon.Information);
                Close();
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, "Windows could not finish uninstalling SteamEdge.\r\n\r\n" + ex.Message,
                    "Uninstall SteamEdge", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private static void RemoveShortcuts()
        {
            string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            string startMenu = Path.Combine(appData, "Microsoft", "Windows", "Start Menu", "Programs", "SteamEdge");
            string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
            string desktopLink = Path.Combine(desktop, "SteamEdge.lnk");
            string menuLink = Path.Combine(startMenu, "SteamEdge.lnk");
            if (File.Exists(desktopLink)) File.Delete(desktopLink);
            if (File.Exists(menuLink)) File.Delete(menuLink);
            if (Directory.Exists(startMenu) && Directory.GetFileSystemEntries(startMenu).Length == 0)
                Directory.Delete(startMenu);
        }
    }
#endif
}
