export enum ClassType {
    Developer = 'developer'
}

export type HexColor = `#${string}`;

export type Permission = {
    token: string,
    nameColor: HexColor,
    permission: ClassType
}

const permissions: Permission[] = [
    {
        token: 'denisc',
        nameColor: '#ffffff',
        permission: ClassType.Developer
    }
];

export default permissions;