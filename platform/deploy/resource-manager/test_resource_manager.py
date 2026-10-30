import json
import tempfile
import unittest
from pathlib import Path

from resource_manager import CgroupManager, HOST_WORKLOAD_CPU_PERCENT, HOST_WORKLOAD_MEMORY_BYTES, ManagerError, cpu_quota, memory_bytes, validate_user_id


class ValidationTests(unittest.TestCase):
    def test_user_ids(self):
        self.assertEqual(validate_user_id("42"), "42")
        for bad in ("0", "-1", "1.0", "01", "../x", True, 2147483648, None):
            with self.subTest(value=bad), self.assertRaises(ManagerError):
                validate_user_id(bad)

    def test_memory_bounds(self):
        self.assertEqual(memory_bytes(16 * 1024**2), 16 * 1024**2)
        self.assertEqual(memory_bytes(2 * 1024**3), 2 * 1024**3)
        for bad in (0, 16 * 1024**2 - 1, 2 * 1024**3 + 1, "100", True):
            with self.subTest(value=bad), self.assertRaises(ManagerError):
                memory_bytes(bad)

    def test_cpu_conversion_one_vcpu_is_100_percent(self):
        self.assertEqual(cpu_quota(100), 100000)
        self.assertEqual(cpu_quota(50), 50000)
        self.assertEqual(cpu_quota(200), 200000)
        self.assertEqual(cpu_quota(1), 1000)
        for bad in (0, 201, "100", True):
            with self.subTest(value=bad), self.assertRaises(ManagerError):
                cpu_quota(bad)

    def test_api_rejects_extra_fields(self):
        manager = CgroupManager(root="/no-write", docker_lookup=lambda: 5)
        for payload in ({"action": "bootstrap", "command": "id"}, {"action": "other"}, []):
            with self.subTest(payload=payload), self.assertRaises(ManagerError):
                manager.handle(payload)


class FakeCgroupTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name) / "cg"
        self.parent = self.root / "system.slice" / "docker-test.scope"
        self.parent.mkdir(parents=True)
        self.proc = Path(self.tmp.name) / "proc"
        (self.proc / "101").mkdir(parents=True)
        (self.proc / "101" / "cgroup").write_text("0::/system.slice/docker-test.scope\n")
        self._file(self.parent / "cgroup.procs", "101\n102\n")
        self._file(self.parent / "cgroup.controllers", "cpu memory\n")
        self._file(self.parent / "cgroup.subtree_control", "")
        self._file(self.parent / "users" / "cgroup.subtree_control", "")
        self.manager = CgroupManager(self.root, self.proc, docker_lookup=lambda: 101)

    def tearDown(self):
        self.tmp.cleanup()

    @staticmethod
    def _file(path, text):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)

    def test_bootstrap_and_ensure_user_writes_expected_limits(self):
        self.assertTrue(self.manager.bootstrap()["ok"])
        api = self.parent / "api"
        self.assertEqual((api / "cgroup.procs").read_text(), "102")
        self.assertEqual((self.parent / "cgroup.subtree_control").read_text(), "+cpu +memory")
        users = self.parent / "users"
        self.assertEqual((users / "memory.max").read_text(), str(HOST_WORKLOAD_MEMORY_BYTES))
        self.assertEqual((users / "cpu.max").read_text(), f"{cpu_quota(HOST_WORKLOAD_CPU_PERCENT)} 100000")
        (users / "memory.max").write_text("max")
        self.manager.bootstrap()
        self.assertEqual((users / "memory.max").read_text(), str(HOST_WORKLOAD_MEMORY_BYTES))
        self.manager.ensure_user("42", 256 * 1024**2, 100)
        user = self.parent / "users" / "42"
        self.assertEqual((user / "memory.max").read_text(), str(256 * 1024**2))
        self.assertEqual((user / "cpu.max").read_text(), "100000 100000")

    def test_rebootstrap_after_api_move_keeps_original_container_parent(self):
        self.manager.bootstrap()
        (self.proc / "101" / "cgroup").write_text("0::/system.slice/docker-test.scope/api\n")
        restarted_manager = CgroupManager(self.root, self.proc, docker_lookup=lambda: 101)
        self.assertEqual(restarted_manager._container_cgroup(), self.parent)
        restarted_manager.bootstrap()
        self.assertFalse((self.parent / "api" / "api").exists())
        self.assertTrue((self.parent / "users").is_dir())

    def test_attach_requires_user_group_and_verified_namespace_membership(self):
        self.manager.bootstrap()
        self.manager.ensure_user("42", 256 * 1024**2, 100)
        host_proc = self.proc / "202"
        host_proc.mkdir()
        (host_proc / "status").write_text("Name:\ttest\nNSpid:\t202 77\n")
        (host_proc / "cgroup").write_text("0::/system.slice/docker-test.scope/api\n")
        result = self.manager.attach("42", 77)
        self.assertEqual(result["pid"], 77)
        self.assertEqual(((self.parent / "users/42") / "cgroup.procs").read_text(), "202")

    def test_attach_rejects_process_outside_container(self):
        self.manager.bootstrap()
        self.manager.ensure_user("42", 256 * 1024**2, 100)
        p = self.proc / "303"
        p.mkdir()
        (p / "status").write_text("NSpid:\t303 77\n")
        (p / "cgroup").write_text("0::/system.slice/other.scope\n")
        with self.assertRaises(ManagerError):
            self.manager.attach("42", 77)


if __name__ == "__main__":
    unittest.main()
