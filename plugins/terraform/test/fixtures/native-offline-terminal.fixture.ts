/** Offline native PTY only; no SSH or live GCP acceptance. */
export const terminalSource = String.raw`
#include <poll.h>
#include <stdio.h>
#include <string.h>
#include <termios.h>
#include <time.h>
#include <unistd.h>
int main(int argc, char **argv) {
  (void)argc; (void)argv;
  struct termios settings;
  if (tcgetattr(0, &settings)) return 2;
  cfmakeraw(&settings);
  if (tcsetattr(0, TCSANOW, &settings)) return 3;
  setvbuf(stdout, NULL, _IONBF, 0);
  struct timespec began, now;
  clock_gettime(CLOCK_MONOTONIC, &began);
  char command[256] = {0}; size_t length = 0; int escape = 0;
  fputs(">>> ", stdout);
  for (;;) {
    clock_gettime(CLOCK_MONOTONIC, &now);
    if (now.tv_sec - began.tv_sec >= 270) return 4;
    struct pollfd input = {0, POLLIN, 0};
    if (poll(&input, 1, 100) < 0) return 5;
    if (!(input.revents & POLLIN)) continue;
    unsigned char byte;
    if (read(0, &byte, 1) != 1) return 0;
    if (escape) { if (byte == '.') return 0; escape = 0; }
    if (byte == '~') { escape = 1; continue; }
    if (byte == 21) { length = 0; command[0] = 0; continue; }
    if (byte == '\t') {
      if (!strncmp(command, "execcli journalctl ", 18))
        fputs("\r\n--help -u -b -p -o --no-pager --utc\r\n>>> ", stdout);
      else if (!strncmp(command, "execcli crictl-logs ", 19))
        fputs("\r\n--help --tail\r\n>>> ", stdout);
      else if (!strncmp(command, "execcli ", 8))
        fputs("\r\ndate ip-address ip-route journalctl crictl-ps-a crictl-inspect crictl-logs\r\n>>> ", stdout);
      else if (!strncmp(command, "status ", 7)) fputs("\r\nvpm\r\n>>> ", stdout);
      else fputs("\r\nhealth diagnosis status execcli exit\r\n>>> ", stdout);
      continue;
    }
    if (byte == '\r') {
      printf("%s\r\n", command);
      if (!strcmp(command, "health")) fputs("OFFLINE_FIXTURE_HEALTH\r\n", stdout);
      if (!strcmp(command, "execcli journalctl --help")) {
        fputs("journalctl [OPTIONS...] [MATCHES...]\r\n", stdout);
        fputs(" -u --unit=UNIT Show logs from the specified unit\r\n", stdout);
        fputs(" -b --boot[=ID] Show logs from the specified boot\r\n", stdout);
        fputs(" -p --priority=RANGE Show entries of the specified priority\r\n", stdout);
        fputs(" -o --output=STRING Change journal output mode\r\n", stdout);
        fputs(" --no-pager Do not pipe output into a pager\r\n", stdout);
        fputs(" --utc Express time in Coordinated Universal Time\r\n", stdout);
      }
      if (!strcmp(command, "execcli journalctl -u vpm --no-pager --utc -o short-iso-precise"))
        for (int index = 0; index < 250; index++)
          printf("2026-11-21T00:00:00+0000 OFFLINE_JOURNAL_%d\r\n", index);
      if (!strcmp(command, "execcli crictl-logs --help"))
        fputs("NAME:\r\n crictl logs - Fetch the logs of a container\r\nUSAGE:\r\n crictl logs [command options] CONTAINER-ID\r\nOPTIONS:\r\n --tail value Number of lines to show from the end of the logs (default: -1)\r\n", stdout);
      if (!strcmp(command, "execcli crictl-ps-a"))
        fputs("CONTAINER ID IMAGE\r\ncccccccccccccccc offline-vpm\r\ndddddddddddddddd offline-exited\r\n", stdout);
      if (!strncmp(command, "execcli crictl-logs ", 19) && strstr(command, "--tail=-1"))
        fputs("OFFLINE_FULL_CONTAINER_LOG\r\n", stdout);
      fputs(">>> ", stdout);
      length = 0; command[0] = 0; continue;
    }
    if (length + 1 >= sizeof(command)) return 6;
    command[length++] = (char)byte; command[length] = 0;
  }
}
`;
