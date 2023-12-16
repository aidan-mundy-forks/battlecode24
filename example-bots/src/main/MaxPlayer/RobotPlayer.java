package MaxPlayer;

import java.util.*;

import battlecode.common.*;

import static MaxPlayer.RobotPlayer.MaxPlayerState.*;

public class RobotPlayer {
    static final Random rng = new Random(7598);

    static final Direction[] directions = {
        Direction.NORTH,
        Direction.NORTHEAST,
        Direction.EAST,
        Direction.SOUTHEAST,
        Direction.SOUTH,
        Direction.SOUTHWEST,
        Direction.WEST,
        Direction.NORTHWEST,
    };

    static final Direction[] directionsZigzag = {
        Direction.NORTHEAST,
        Direction.NORTH,
        Direction.NORTHWEST,
        Direction.EAST,
        Direction.CENTER,
        Direction.WEST,
        Direction.SOUTHEAST,
        Direction.SOUTH,
        Direction.SOUTHWEST,
    };

    public static enum MaxPlayerState {
        NOT_SPAWNED,
        IDLE,
        CHECKING_FOR_FLAG,
        SETTING_UP,
        PLACING_FLAG,
        LOOKING_FOR_ENEMY_FLAG,
        TRAVELING_TO_ENEMY_FLAG,
        BRINGING_ENEMY_FLAG_BACK,
        NAVIGATING_OBSTACLE,
    }

    static MaxPlayerState state;
    static MaxPlayerState nextState;
    static int numIdleTurns;
    static MapLocation target;
    static Direction secondaryDir = Direction.CENTER;
    // static MapInfo obstacle1;
    // static MapInfo obstacle2;
    // static MapInfo obstacle3;
    static final int claimedFlagsCommStart = 1;
    static final int nextUnusedFlagCommIndex = 0;

    private static void moveRandom(RobotController rc) throws GameActionException {
        Direction[] goodDirs = new Direction[directions.length];
        int numGoodDirs = 0;

        for (Direction dir : directions) {
            if (rc.canMove(dir)) {
                goodDirs[numGoodDirs] = dir;
                numGoodDirs++;
            }
        }

        if (numGoodDirs > 0) {
            int rand = rng.nextInt(numGoodDirs);
            Direction dir = goodDirs[rand];
            rc.move(dir);
        }
    }

    private static Direction dirTowards(MapLocation current, MapLocation target) {
        int diffSignX = Integer.signum(target.x - current.x);
        int diffSignY = Integer.signum(target.y - current.y);

        return directionsZigzag[4 - diffSignX - 3 * diffSignY];
    }

    private static int dot(Direction dir1, Direction dir2) {
        return dir1.dx * dir2.dx + dir1.dy * dir2.dy;
    }

    private static int dotMod(Direction dir1, Direction dir2) {
        if (dir1 == Direction.CENTER || dir2 == Direction.CENTER) {
            return 0;
        }

        int dot1 = dot(dir1, dir1);
        int dot2 = dot(dir2, dir2);
        int dot3 = dot(dir1, dir2);
        int answer = Integer.signum(dot3) * (4 * dot3 * dot3) / (dot1 * dot2);
        System.out.println("dotMod of " + dir1 + " and " + dir2 + " is " + answer);
        return answer;
    }

    private static int composeCompares(int a, int b, int c, int d) {
        int x = Integer.compare(a, b);
        return x == 0 ? Integer.compare(c, d) : x;
    }

    private static Direction[] orderDirsBySimilarity(Direction dir, Direction secDir) {
        List<Direction> dirs = Arrays.asList(directions);
        dirs.sort((d1, d2) -> -composeCompares(dotMod(d1, dir), dotMod(d2, dir), dotMod(d1, secDir), dotMod(d2, secDir)));
        return (Direction[])dirs.toArray();
    }

    private static void moveTowards(RobotController rc, MapLocation target) throws GameActionException {
        MapLocation loc = rc.getLocation();

        int diffSignX = Integer.signum(target.x - loc.x);
        int diffSignY = Integer.signum(target.y - loc.y);
        Direction dir = directionsZigzag[4 - diffSignX - 3 * diffSignY];
        Direction dir2 = directionsZigzag[4 - 3 * diffSignY];
        Direction dir3 = directionsZigzag[4 - diffSignX];

        if (rc.canMove(dir)) {
            rc.move(dir);
        } else if (rc.canMove(dir2)) {
            rc.move(dir2);
        } else if (rc.canMove(dir3)) {
            rc.move(dir3);
        } else {
            // obstacle1 = rc.senseMapInfo(loc.add(dir));
            // obstacle2 = rc.senseMapInfo(loc.add(dir2));
            // obstacle3 = rc.senseMapInfo(loc.add(dir3));
            nextState = state;
            state = NAVIGATING_OBSTACLE;
            runNavigatingObstacle(rc);
        }
    }

    private static void runNotSpawned(RobotController rc) throws GameActionException {
        MapLocation[] spawnZoneLocs = rc.getAllySpawnLocations();
        MapLocation[] goodLocs = new MapLocation[spawnZoneLocs.length];
        int numGoodLocs = 0;

        for (MapLocation loc : spawnZoneLocs) {
            if (rc.canSpawn(loc)) {
                goodLocs[numGoodLocs] = loc;
                numGoodLocs++;
            }
        }

        if (numGoodLocs > 0) {
            int rand = rng.nextInt(numGoodLocs);
            MapLocation spawnLoc = goodLocs[rand];
            rc.spawn(spawnLoc);
            state = CHECKING_FOR_FLAG;
        }
    }

    private static void runIdle(RobotController rc) throws GameActionException {
        if (numIdleTurns == 0) {
            state = nextState;
        } else {
            numIdleTurns--;
        }
    }

    private static void runCheckingForFlag(RobotController rc) throws GameActionException {
        MapLocation loc = rc.getLocation();

        if (rc.canPickupFlag(loc)) {
            rc.pickupFlag(loc);
            state = PLACING_FLAG;
        } else if (rc.getRoundNum() < 200) {
            state = SETTING_UP;
        } else {
            state = LOOKING_FOR_ENEMY_FLAG;
        }
    }

    private static void runSettingUp(RobotController rc) throws GameActionException {
        moveRandom(rc);

        // sense flags nearby
        // FlagInfo[] flagLocs = rc.senseNearbyFlags(GameConstants.VISION_RADIUS_SQUARED, rc.getTeam());

        // FlagInfo minRadiusSquaredFlag = null;
        // int minRadiusSquared = Integer.MAX_VALUE;

        // for (FlagInfo flag : flagLocs) {
        //     if (flag.isPickedUp()) {
        //         continue;
        //     }

        //     MapLocation loc = flag.getLocation();

        //     boolean bad = false;
        //     int commIndex = rc.readSharedArray(nextUnusedFlagCommIndex);

        //     for (int i = 0; i < (commIndex - claimedFlagsCommStart) / 2; i++) {
        //         int index = claimedFlagsCommStart + 2 * i;
        //         int x = rc.readSharedArray(index);
        //         int y = rc.readSharedArray(index + 1);
        //         System.out.println("Checking [ci=" + index + "] that [" + x + ", " + y + "] != " + loc + ".");

        //         if (loc.x == x && loc.y == y) {
        //             bad = true;
        //         }
        //     }

        //     if (bad) {
        //         continue;
        //     }

        //     int radiusSquared = flag.getLocation().distanceSquaredTo(rc.getLocation());

        //     if (radiusSquared < minRadiusSquared) {
        //         minRadiusSquared = radiusSquared;
        //         minRadiusSquaredFlag = flag;
        //     }
        // }

        // if (minRadiusSquaredFlag != null) {
        //     target = minRadiusSquaredFlag.getLocation();
        //     int numFlagsFound = rc.readSharedArray(nextUnusedFlagCommIndex);

        //     rc.writeSharedArray(nextUnusedFlagCommIndex, commIndex + 2);
        //     rc.writeSharedArray(commIndex, target.x);
        //     rc.writeSharedArray(commIndex + 1, target.y);
        //     System.out.println("Notifying all robots [ci=" + commIndex + "] about claimed flag at " + target + ".");
        //     state = TRAVELING_TO_FLAG;
        // } else {
        //     moveRandom(rc);
        // }
    }

    // private static void runTravelingToFlag(RobotController rc) throws GameActionException {
    //     MapLocation loc = rc.getLocation();
    //     int diffSignX = Integer.signum(target.x - loc.x);
    //     int diffSignY = Integer.signum(target.y - loc.y);
    //     Direction dir = directionsZigzag[4 - diffSignX - 3 * diffSignY];

    //     if (dir == Direction.CENTER) {
    //         rc.pickupFlag(loc);
    //         state = PLACING_FLAG;
    //     } else if (rc.canMove(dir)) {
    //         rc.move(dir);
    //     }
    // }

    private static void runPlacingFlag(RobotController rc) throws GameActionException {
        moveRandom(rc);
        // TODO write method
    }

    private static void runLookingForEnemyFlag(RobotController rc) throws GameActionException {
        // sense flags nearby
        FlagInfo[] flagLocs = rc.senseNearbyFlags(GameConstants.VISION_RADIUS_SQUARED, rc.getTeam().opponent());

        FlagInfo minRadiusSquaredFlag = null;
        int minRadiusSquared = Integer.MAX_VALUE;

        for (FlagInfo flag : flagLocs) {
            if (flag.isPickedUp()) {
                continue;
            }

            int radiusSquared = flag.getLocation().distanceSquaredTo(rc.getLocation());

            if (radiusSquared < minRadiusSquared) {
                minRadiusSquared = radiusSquared;
                minRadiusSquaredFlag = flag;
            }
        }

        if (minRadiusSquaredFlag != null) {
            target = minRadiusSquaredFlag.getLocation();
            state = TRAVELING_TO_ENEMY_FLAG;
            // System.out.println("Found enemy flag: " + target);
        } else {
            moveRandom(rc);
        }
    }

    private static void runTravelingToEnemyFlag(RobotController rc) throws GameActionException {
        MapLocation loc = rc.getLocation();

        if (rc.canPickupFlag(loc)) {
            rc.pickupFlag(loc);
            state = BRINGING_ENEMY_FLAG_BACK;

            MapLocation[] spawnZones = rc.getAllySpawnLocations();
            int minDistSq = Integer.MAX_VALUE;
            MapLocation closestSpawnZone = null;

            for (MapLocation spawnZone : spawnZones) {
                int distSq = loc.distanceSquaredTo(spawnZone);

                if (distSq < minDistSq) {
                    minDistSq = distSq;
                    closestSpawnZone = spawnZone;
                }
            }

            if (closestSpawnZone == null) {
                throw new RuntimeException("There are no spawn zones. This is bad.");
            }

            target = closestSpawnZone;
            return;
        }

        FlagInfo[] flags = rc.senseNearbyFlags(GameConstants.VISION_RADIUS_SQUARED, rc.getTeam().opponent());
        boolean good = false;

        for (FlagInfo flag : flags) {
            if (!flag.isPickedUp() && flag.getLocation() == target) {
                good = true;
            }
        }

        if (!good) {
            state = LOOKING_FOR_ENEMY_FLAG;
            // System.out.println("Gave up on enemy flag: " + target);
            return;
        }

        moveTowards(rc, target);
    }

    private static void runBringingEnemyFlagBack(RobotController rc) throws GameActionException {
        MapInfo info = rc.senseMapInfo(rc.getLocation());

        if (info.getSpawnZoneTeam() == rc.getTeam().ordinal() + 1) {
            state = IDLE;
            nextState = LOOKING_FOR_ENEMY_FLAG;
            numIdleTurns = 1;
            return;
        } else {
            moveTowards(rc, target);
        }
    }

    private static void runNavigatingObstacle(RobotController rc) throws GameActionException {
        MapLocation loc = rc.getLocation();
        Direction dir = dirTowards(loc, target);
        Direction[] dirs = orderDirsBySimilarity(dir, secondaryDir);

        String s = "";

        for (Direction d : dirs) {
            s += d.toString();
            s += "<";
        }

        System.out.println("Ordered dirs by sim to " + dir + " then " + secondaryDir + ": " + s);
        int smallestWater = -1;

        for (int i = 0; i < dirs.length; i++) {
            Direction dir2 = dirs[i];
            MapLocation newLoc = loc.add(dir2);
            MapInfo info = rc.senseMapInfo(newLoc);

            if (rc.canMove(dir2)) {
                if (i < 3) {
                    rc.move(dir2);
                    state = nextState;
                    secondaryDir = Direction.CENTER;
                    return;
                } else if (i < 5 && smallestWater < 0) {
                    rc.move(dir2);
                    if (secondaryDir == Direction.CENTER) secondaryDir = dir2;
                    return;
                } else if (smallestWater < 0) {
                    rc.move(dir2);
                    return;
                }
            } else if (info.isWater() && i < 3) {
                if (smallestWater < 0 && rc.canFill(newLoc)) {
                    smallestWater = i;
                }
            }
        }

        if (smallestWater >= 0) {
            rc.fill(loc.add(dirs[smallestWater]));
        }
    }

    public static void run(RobotController rc) throws GameActionException {
        while (true) {
            try {
                if (state == null || !rc.isSpawned() || rc.getLocation() == null) {
                    state = NOT_SPAWNED;
                } else if (rc.getRoundNum() >= 200 && (state == SETTING_UP || state == PLACING_FLAG)) {
                    state = LOOKING_FOR_ENEMY_FLAG;
                }

                switch (state) {
                    case NOT_SPAWNED:
                        runNotSpawned(rc);
                        break;

                    case IDLE:
                        runIdle(rc);
                        break;
                    
                    case SETTING_UP:
                        runSettingUp(rc);
                        break;

                    case CHECKING_FOR_FLAG:
                        runCheckingForFlag(rc);
                        break;
                    
                    case PLACING_FLAG:
                        runPlacingFlag(rc);
                        break;

                    case LOOKING_FOR_ENEMY_FLAG:
                        runLookingForEnemyFlag(rc);
                        break;

                    case TRAVELING_TO_ENEMY_FLAG:
                        // System.out.println("TRAVELING TO ENEMY FLAG");
                        runTravelingToEnemyFlag(rc);
                        break;

                    case BRINGING_ENEMY_FLAG_BACK:
                        runBringingEnemyFlagBack(rc);
                        break;

                    case NAVIGATING_OBSTACLE:
                        runNavigatingObstacle(rc);
                        break;

                    // default:
                    //     throw new RuntimeException("A COSMIC RAY HIT YOUR COMPUTER AND TRIGGERED THIS ERROR. THERE IS NO OTHER EXPLANATION FOR SUCH A BAD ERROR.");
                }
            } catch (GameActionException e) {
                System.out.println("GameActionException! Message: " + e.getMessage());
                System.out.println("\u26A1\u26A1 A COSMIC RAY HIT YOUR COMPUTER AND TRIGGERED THIS ERROR. THERE IS NO OTHER EXPLANATION FOR SUCH A BAD ERROR. I MAKE NO MISTAKES.");
            } /* catch (Exception e) {
                System.out.println("Other Exception! Type: " + e.getClass() + " Message: " + e.getMessage());
            } */ finally {
                Clock.yield();
            }
        }
    }
}
