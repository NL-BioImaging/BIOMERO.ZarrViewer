class Value:
    def __init__(self, value):
        self.value = value

    def getValue(self):
        return self.value


class FakeOriginalFile:
    def __init__(self, path, name):
        self.path = path
        self.name = name

    def getPath(self):
        return Value(self.path)

    def getName(self):
        return Value(self.name)


class FakeFileset:
    def __init__(self, files):
        self.files = files

    def listFiles(self):
        return list(self.files)


class FakeAnnotation:
    def __init__(self, namespace, values):
        self.namespace = namespace
        self.values = values

    def getNs(self):
        return self.namespace

    def getValue(self):
        return list(self.values.items())


class FakeParent:
    def __init__(self, object_id, name="parent", annotations=(), parents=()):
        self.object_id = object_id
        self.name = name
        self.annotations = list(annotations)
        self.parents = list(parents)

    def getId(self):
        return self.object_id

    def getName(self):
        return self.name

    def listAnnotations(self, ns=None):
        return [ann for ann in self.annotations if ns is None or ann.getNs() == ns]

    def listParents(self):
        return list(self.parents)


class FakeImage(FakeParent):
    def __init__(self, image_id, name, files, annotations=(), parents=()):
        super().__init__(image_id, name, annotations, parents)
        self.image_id = image_id
        self.fileset = FakeFileset(files)

    def getFileset(self):
        return self.fileset


class FakeWellSample(FakeParent):
    def __init__(self, object_id, image, parents=()):
        super().__init__(object_id, parents=parents)
        self.image = image

    def getImage(self):
        return self.image


class EventContext:
    def __init__(self, user_id, group_id):
        self.userId = user_id
        self.groupId = group_id


class FakeConnection:
    def __init__(self, image=None, plate=None, well=None, user_id=7, group_id=13):
        self.image = image
        self.plate = plate
        self.well = well
        self.user_id = user_id
        self.context = EventContext(user_id, group_id)

    def getObject(self, object_type, object_id):
        if object_type == "Image" and self.image and int(object_id) == self.image.image_id:
            return self.image
        if object_type == "Plate" and self.plate and int(object_id) == int(self.plate.getId()):
            return self.plate
        if object_type == "Well" and self.well and int(object_id) == int(self.well.getId()):
            return self.well
        return None

    def getUserId(self):
        return self.user_id

    def getEventContext(self):
        return self.context
